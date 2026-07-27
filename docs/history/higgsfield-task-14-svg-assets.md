# TASK 14 — SVG assets break generation (prod bug)

> ## ⛔ RULE 0 — NO ASSET GENERATION
> No image/video/any asset generation. Free: `tsc`, `lint`, `--balance`, `--cost`, `--models`, `--capabilities`, `--prompt`.
> Balance: **1441.15 credits.**

**Severity: blocks the feature in production.** Every Higgsfield generation for Tanda fails.

---

## Symptom

UI: `1 variation(s) failed: No URL in Higgsfield response`

Prod log:
```
[higgsfield] uploaded: /api/media/logos/28447361-8781-48f7-a523-867e414588b9.svg -> d9f3a01e-…
[higgsfield] model marketing_studio_image accepts max 1 references, using 1 of 5
[higgsfield] generating image with model marketing_studio_image, aspect 4:5, 1 media(s)
[higgsfield] passing 1 medias to generate_image: [{"value":"d9f3a01e-…","role":"image"}]
[higgsfield] variation 1/1 failed: No URL in Higgsfield response
[higgsfield] invalidated 1 cached media IDs
```

## Cause

The product logo is an **SVG**. `buildMedias` prefers the logo over screenshots (my instruction in review #4), so the single allowed reference slot is filled with a vector file. Higgsfield's image models take raster input only — the job never produces a result and the response has no URL.

Two contributing defects:

1. **`contentTypeFromExt()` in `assets.ts` has no `.svg` entry**, so the upload is presigned as `application/octet-stream`. The presign and PUT both "succeed" — nothing fails until generation.
2. **Asset selection has no format filter.** Any file in `products.logo` / `products.screenshots` is treated as a valid generation input.

The self-heal from M12 did fire correctly (`invalidated 1 cached media IDs`), but a retry re-uploads the same SVG and fails identically.

---

## Fix

### Preferred — rasterise SVG on upload
`sharp` is already a dependency and already used in the render pipeline. In `ensureProductAssetsUploaded`, when the source file is `.svg`, convert it to PNG before presigning:

```ts
const buf = ext === ".svg"
  ? await sharp(await readFile(filePath)).png().resize({ width: 1024, withoutEnlargement: true }).toBuffer()
  : await readFile(filePath);
```
Upload it with `image/png` and a `.png` filename. Cache the resulting media_id against the original `localPath` as usual.

This keeps the logo usable as a brand reference, which is the point of having it.

### Required regardless — guard the format
Define the raster whitelist explicitly: `.png`, `.jpg`, `.jpeg`, `.webp`.

- Add `.svg` → `image/svg+xml` to `contentTypeFromExt` so the type is at least honest.
- In asset selection, **skip any file whose extension is not raster (after the SVG conversion above)** and log at `[higgsfield]`: `skipping <path> — unsupported format for generation input`.
- Never presign a file we know the model cannot consume.

### Selection order
Keep preferring the logo **only when it is a usable raster (or successfully rasterised)**. Otherwise fall through to the first screenshot. Log which asset was chosen and why:

```
[higgsfield] reference: logo (rasterised from svg)
[higgsfield] reference: screenshot 1 (logo skipped — unsupported format)
```

### Clear the poisoned cache row
The bad media_id for the SVG is cached in prod. The self-heal already invalidated it, but confirm `higgsfield_assets` holds no row pointing at a `.svg` `local_path` after the fix, in both dev and prod DBs.

---

## Also fix — the error message is useless

`No URL in Higgsfield response` tells the user nothing actionable. When the MCP returns no URL, include whatever the tool actually said (error text and request ID) in the `GenerationFailure.message`, as review #4 asked. Right now a failed generation is undiagnosable without server logs.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --assets 1
```

`--assets 1` must show the SVG logo either rasterised to PNG or explicitly skipped, with a clear `[higgsfield]` line either way. Paste it.

**Do not run a generation.** The owner will do the one real end-to-end test once this lands.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Deploy with `bash scripts/deploy-prod.sh` — a plain `npm run build` writes to the dev dist dir and prod silently keeps its old build.
- **Do NOT commit.**
- Report lint counts exactly as printed.
