# TASK 01 — APPROVED ✅ / TASK 02 — Phase 2: Asset Upload + Cache

**Plan:** `plans/higgsfield-engine.md` (authoritative spec)
**Scope:** Phase 2 ONLY. Do not start Phases 3–7.

---

## Part 1 — Task 01 sign-off

Verified independently on your working tree:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, silent ✅ |
| `npm run lint` | 0 errors; only the pre-existing `settings/page.tsx` warning ✅ |
| `npx tsx scripts/test-higgsfield.ts` | clean "credentials not configured", exit 0 ✅ |
| M4 spike script | fixed — uses `getApiKey` ✅ |
| M5 `require()` | fixed — ESM `import ffmpegStatic from "ffmpeg-static"` ✅ |
| M6 `probeDuration` | fixed — async `ffmpeg.ffprobe()`, reads `metadata.format.duration` ✅ |
| M7 Soul branch | dropped entirely ✅ |

**Task 01 is accepted.** Good, clean round.

Minor note: your report said `Warnings: 0`, but there is 1 pre-existing warning in `settings/page.tsx`. Not yours and not a problem — but report the number you actually see. Precision on this matters more than it looks, and the last two rounds turned on it.

### Two items carried forward (not blocking, do not fix now)

1. **S4 — extensions still hardcoded.** `client.ts:127` writes `"jpg"` and the video path writes `"mp4"`. Formally deferred. Revisit if Higgsfield ever returns PNG/WebP.
2. **`ffprobe` portability — new finding from my review.** `ffmpeg-static` ships **only the `ffmpeg` binary** — there is no `ffprobe` in it, and `setFfprobePath()` is never called. Your `probeDuration` works on this dev machine purely because `/usr/bin/ffprobe` happens to exist. On a slim production container — exactly where `ffmpeg-static` earns its place — it will silently return `null` forever.
   Not a Phase 2 problem, and `null` is now a legitimate return value. **But log at `[higgsfield]` when the probe fails** so it's visible rather than silent, and note it in the plan's risk table. It becomes real in Phase 5.

---

## Part 2 — Task 02 assignment

Implement **Phase 2** from `plans/higgsfield-engine.md` §5: asset upload + cache.

**Why this exists:** Higgsfield's servers cannot fetch `localhost/api/media/...`. Product logos and screenshots must be pushed to Higgsfield's CDN and the resulting public URLs cached, so we upload each asset once rather than on every generation.

### 1. New table — `drizzle/schema.ts`

```ts
export const higgsfieldAssets = sqliteTable("higgsfield_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  localPath: text("local_path").notNull(),   // "/api/media/logos/x.png" — cache key
  kind: text("kind"),                        // "logo" | "screenshot"
  hfUrl: text("hf_url").notNull(),           // CDN URL returned by upload
  createdAt: integer("created_at", { mode: "timestamp" }),
});
```

Export `HiggsfieldAsset` / `NewHiggsfieldAsset` types alongside the existing ones at the bottom of the file.

Apply with **`npm run db:push`** — NOT `db:generate`/`db:migrate` (the journal is stale). New columns nullable per the convention documented on `jobs.cancelRequested`.

### 2. `src/lib/higgsfield/assets.ts`

```ts
export async function ensureProductAssetsUploaded(
  productId: number
): Promise<{ logoUrl?: string; screenshotUrls: string[] }>
```

Behaviour:
- Read `products.logo` (single string) and `products.screenshots` (JSON string array).
- For each asset, look up `higgsfield_assets` by `(productId, localPath)`.
  - **Cache hit** → reuse `hfUrl`, no upload.
  - **Miss** → read bytes from disk → `hfUpload(buffer, contentType)` → insert row.
- Cap screenshots at **4** (matches `prepareImages` behaviour).
- Skip missing files with a `[higgsfield]` warning. **Never throw** for one bad asset.

**Path resolution — read this carefully.** The DB stores the URL form `/api/media/logos/x.png`. The file on disk is at `public/media/logos/x.png`. Strip the `/api/media/` prefix and join onto `process.cwd()/public/media/`.

`src/lib/images.ts` `prepareImages()` gets this wrong today — it treats a leading `/` as an absolute filesystem path and silently swallows the failure in a bare catch. **Do not copy that bug.** Do not fix that function either; it's out of scope.

Derive `contentType` from the file extension.

### 3. Extend `scripts/test-higgsfield.ts`

Add an assets mode that takes a product id, calls `ensureProductAssetsUploaded`, and prints the returned CDN URLs. Keep the existing image/video steps working and keep the clean "credentials not configured" exit.

---

## Verification (paste actual output)

```
npm run db:push          # confirm the table is created
npx tsc --noEmit         # expect: silent, exit 0
npm run lint             # expect: 0 errors, 1 pre-existing warning in settings/page.tsx
npx tsx scripts/test-higgsfield.ts
```

Additionally, **prove the cache works**: run the assets path twice against the same product and show that the second run performs no upload. Without credentials you can still prove the DB lookup path and the file resolution — say plainly which parts you could and could not exercise.

---

## Hard constraints

- **Additive only.** Do not modify the spec/Remotion/creative-director pipeline. Do not touch `src/lib/generate.ts` — engine wiring is Phase 6.
- Do not fix `src/lib/images.ts`.
- TypeScript strict. Match surrounding style. No speculative abstractions.
- **Do NOT commit.** Leave changes in the working tree.
- If the plan conflicts with what you find in the code, **STOP and report** rather than guessing.

## Report back with

1. Files created/modified
2. **Actual pasted output** of all four commands above
3. Whether the cache-hit path was proven, and how
4. Anything in the plan that looks wrong
