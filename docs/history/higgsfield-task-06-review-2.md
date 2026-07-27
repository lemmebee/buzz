# TASK 06 (Phase 4) — CTO Review #2

**Verdict:** M11, S9 and S4 accepted. **S10 is solved — I found the cause and proved the fix.** Apply it and Phase 4 is done.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning (settings/page.tsx:135)
```

Your report again says "3 errors" — there are **0**. Fourth time on this number. Run the command, copy what it prints.

## Accepted

- **M11 (async polling)** — the two-step generate → poll pattern in a single CLI call works. Three real PNGs produced. Refactoring `spawnCli` to take `tools: string[]` was the right move.
- **S9 (fabricated credits)** — removed rather than invented. Correct.
- **S4 (extensions)** — `extFromUrl()` derives from the URL; results correctly save as `.png`.

Good round.

---

## S10 — SOLVED: the role name

You reported this as needing "MCP schema investigation". I did it.

**Cause:** `medias[].role` must be exactly `"image"` for `marketing_studio_image`. `models_explore(action:'get', model_id:'marketing_studio_image')` declares:

```json
"medias":[{"name":"medias","type":"image","roles":["image"]}]
```

One role, exactly `"image"`. Any other value is silently dropped — no error, `input_images` just comes back `[]`.

**Proven working call** (verified live, `input_images` came back populated):

```json
{"params":{
  "model":"marketing_studio_image",
  "prompt":"the app screen shown on a phone resting on desert sand, soft studio light",
  "aspect_ratio":"1:1",
  "medias":[{"value":"b1565f5e-0097-494d-81c7-e995435b5781","role":"image"}]
}}
```

Response:
```json
"input_images":[{"id":"b1565f5e-...","type":"media_input","url":"https://.../..._resize.jpg"}]
```

`medias` goes **inside `params`**, alongside `prompt` — not at the top level. `value` is the media_id from `ensureProductAssetsUploaded`; `role` is the literal string `"image"`.

### Why this matters more than it looks

Without medias, the model invents a plausible-but-fake UI. The earlier run produced a light-theme budget list containing the word **"Canos"** and **"Progress of 230%"** — nonsense that would be embarrassing in a published ad.

With medias, the output shows the **real** Tanda: the TANDA. wordmark, `0/3,000 EUR`, the actual transaction rows (17.20 / 42.99 / 20.00 EUR), the green mic with "Hold to speak", and the real Home/Spending/Insights/Assistant tab bar — composited into a photoreal desert-sand product shot.

That difference is the entire value of Phase 2. Do not ship this feature without it.

### Also apply to video

`marketing_studio_video` declares different roles (`image`, `start_image`, `end_image`) plus `product_ids` and `avatar_ids`. In Phase 5, call `models_explore(action:'get')` for the video model and use its declared roles rather than assuming.

---

## Work

1. Pass `medias: [{value: <media_id>, role: "image"}]` inside `params` in `hfGenerateImage`.
2. Keep the cap at 2–3 references.
3. Keep the `job_params` capture — it's how S10 gets verified. Log at `[higgsfield]` when `input_images` comes back empty while medias were sent, so a silent regression is visible.

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1
```

Pass condition: the saved image shows the **real Tanda UI**, and the completed job's `params.input_images` is **non-empty**. Paste that field.

Run at most twice (~2 credits each; balance ~1607).

## Constraints

- `./node_modules/.bin/...` always, never `npx`.
- Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion pipeline.
- **Do NOT commit.**
- Paste literal output.
