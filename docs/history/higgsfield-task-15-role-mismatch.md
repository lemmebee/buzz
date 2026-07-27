# TASK 15 — The catalog's declared media role can be wrong (video blocked)

> ## ⛔ RULE 0 — NO ASSET GENERATION
> Free: `tsc`, `lint`, `--balance`, `--cost`, `--models`, `--capabilities`, `--prompt`.
> Balance: **1441.15 credits.**

---

## Task 14 — confirmed working ✅

```
[higgsfield] all assets already uploaded for product 1
[higgsfield] reference: logo (cached) -> b04c5154-a14b-4022-87ad-9e41a1cf2596
```

That is a **new** media_id — the old SVG one was `d9f3a01e-…`. The logo was rasterised, re-uploaded, and cached. The SVG bug is fixed.

The capability resolver is also working correctly:
```
[higgsfield] model veo3_1_lite accepts max 1 references, using 1 of 5
[higgsfield] model veo3_1_lite does not support duration 10s, using 8s (from parameters)
[higgsfield] generating video with model veo3_1_lite, aspect 9:16, duration 8s, 1 media(s)
[higgsfield] video cost preflight: 8 credits for 8s
```

Duration snapping, aspect resolution, media capping and cost preflight all behaved.

---

## M19 — `veo3_1_lite` rejects its own declared role

```
[higgsfield] passing 1 medias: [{"value":"b04c5154-…","role":"start_image"}]
[higgsfield] attempt 1 failed: No JSON in CLI output: The API rejected the params:
  role "start_image" is invalid. The server requires "image".
```

`models_explore` declares `medias[].roles: ["start_image","end_image"]` for `veo3_1_lite`. **The API rejects `start_image` and requires `image`.** The catalog is wrong for this model.

This breaks the whole premise of resolving roles from the catalog — the catalog is authoritative until it isn't, and there is no way to know in advance which models lie.

### Fix — self-heal from the error

The error message names the correct role. Parse it and retry once:

1. Send the declared role (current behaviour).
2. If the response contains a role-rejection naming a required role — e.g. `role "X" is invalid. The server requires "Y"` — retry **once** with role `Y`.
3. On success, **persist the corrected role** onto the cached model row (e.g. a `role_override` column) so subsequent calls use it directly and the retry cost is paid once per model, not per generation.
4. Log both: `[higgsfield] role "start_image" rejected, server requires "image" — retrying and caching override`.

Make the parse tolerant: match on the quoted role names in the message rather than the exact sentence, since the wording may vary.

**Do not** hardcode a `veo3_1_lite → image` mapping. Other models will have the same problem and a static map goes stale — this must be general.

Fall back to `"image"` as a last resort if a role rejection occurs and no required role can be parsed: it is the most common value across the catalog.

### Note on agent behaviour — this was correct

The CLI agent refused to alter the params it was told to pass verbatim, and reported the rejection instead of silently "fixing" it. That is the courier rule working as designed: had it improvised, we would have got a silent wrong-role generation instead of a clear error. Keep the verbatim instruction.

---

## M20 — Wrong tool named in the video log line

```
[higgsfield] passing 1 medias to generate_image: …
```

This was a **video** generation. The message is hardcoded to `generate_image` in the shared media-logging path. Make it reflect the actual tool (`generate_image` / `generate_video`), or drop the tool name. Misleading logs cost real debugging time.

---

## Also consider — duration and cost

`config.duration` was 10s, snapped to 8s, costing **8 credits**. At 4s the same model costs **4**. The snap chose the nearest allowed value below the request, which is defensible — but the default `ContentConfig.duration` for reels is what is driving an 8-credit clip.

Not a bug. Worth surfacing in the UI (per S11) so the duration↔cost trade is visible when picking a model. No action required in this task.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --capabilities veo3_1_lite
```

Then deploy:
```
bash scripts/deploy-prod.sh
```

**Confirm the deploy actually happened** before reporting success — check that `.next-prod/BUILD_ID` exists and that `pm2 list` shows a fresh uptime for `buzz-prod`. The previous round reported a successful deploy while pm2 uptime was 9 hours and `BUILD_ID` was missing entirely, which left prod unable to boot if restarted.

**Do not run a generation.** The owner runs the end-to-end test.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Deploy only via `bash scripts/deploy-prod.sh`.
- New columns nullable; `npm run db:push`.
- **Do NOT commit.**
- Report lint counts exactly as printed.
