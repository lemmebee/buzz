# TASK 06 — Phase 4 PLUMBING COMPLETE ✅ / TASK 07 — Reference fidelity + Phase 5 video

**Plan:** `plans/higgsfield-engine.md`

---

## Part 1 — Phase 4 result

`--generate 1` now succeeds end to end:

```
[higgsfield] all assets already uploaded for product 1
[higgsfield] passing 1 medias: [{"value":"b1565f5e-...","role":"image"}]
  "input_images":[{"id":"b1565f5e-...","type":"media_input","url":"https://.../..._resize.jpg"}]
  Progress: 1 posts, 0 errors

Result: 1 posts, 0 errors
  Content: One breath. Three expenses logged. Your budget updated in real-time. No data entry, no friction.
  Media URL: /api/media/hf-1785090061085.png
  Hashtags: #VoiceFirst, #PrivacyFirst, #ZeroBudgeting, #TandaApp, #FinancialCalm
```

Verified: `tsc` exit 0, lint 0 errors + 1 pre-existing warning. The orchestrator, prompt shaping, asset resolution, media passing, async polling, download, and post assembly all work. **The plumbing is done.**

### Root cause of the last failure (fixed on my side)

The `1 media` cap was correct, but it selected `af476c07-...` — a **dead media_id**. That row was cached during the broken curl-approval era, when the presigned PUT never completed but the id was written to the cache anyway. It errors even when sent alone.

I deleted that row; the next run picked `b1565f5e-...` and succeeded.

**M12 — prevent this recurring:** only write a `higgsfield_assets` row **after `media_confirm` returns success.** If confirm fails, do not cache. A cached id that was never confirmed poisons every future generation for that product, silently, forever.

Also add a self-heal: when a generation fails with an MCP error and medias were sent, delete those cache rows so the next run re-uploads instead of failing identically.

---

## Part 2 — M13: the prompt is overriding the reference image

**This is the highest-value fix remaining. Do it before Phase 5.**

The generated image kept the app's *structure* (Tanda header, `0 / 3,000 EUR`, "Hold to speak", the Home/Spending/Insights/Assistant tab bar) but **re-rendered it in a warm sand palette and invented fake text**:

- "Parcern — -3,00 EUR"
- "Bry walent — 17 Jan"
- "Converriance — 28 Hab"
- "LEFT 00 EUR"

The real Tanda screen is **dark charcoal with a bright green mic**, showing real rows (17.20 / 42.99 / 20.00 EUR). The model repainted it.

Compare with an earlier run where the prompt was *"the app screen shown on a phone resting on desert sand, soft studio light"* — that reproduced the real dark UI faithfully, text intact.

**Cause:** when `prompt.ts` writes a rich scene description with its own colour direction ("warm neutral backdrop", "sage green accents"), `marketing_studio_image` treats it as instruction to restyle the screen. The prompt and the reference fight, and the prompt wins — producing gibberish text that is unusable in a published ad.

**Fix in `prompt.ts`:** when `ctx.screenshotMediaIds.length > 0` (or a logo is present), instruct the model to build the prompt differently:

- Describe **only the scene around the device** — surface, lighting, background, camera angle, mood.
- **Do not** describe the app screen, its colours, its layout, or any on-screen text.
- Include an explicit fidelity instruction, e.g. *"Reproduce the provided app screenshot on the device screen exactly as supplied; do not restyle, recolour, or alter any on-screen text."*
- Keep the brand palette guidance for the **environment**, not the screen.

Pass a flag into `buildHiggsfieldPrompt` so it knows a reference image is attached, and branch the OUTPUT FORMAT instructions accordingly. The `CREATIVE_ANGLES` stay — they describe the scene, which is exactly what should still vary.

**Pass condition:** the generated image shows the **real dark Tanda UI** with legible, correct text — no invented words.

---

## Part 3 — Phase 5: video path

Only start this after M12 and M13 land.

### 1. Check the video model's contract first

**Do not assume the image model's limits carry over.** Run:
```
models_explore(action:'get', model_id:'marketing_studio_video')
```
`marketing_studio_video` declares roles `image`, `start_image`, `end_image`, plus `product_ids` and `avatar_ids`, and supports `duration`, `aspect_ratio`, `count`. Record what it actually accepts in `plans/higgsfield-engine.md` before writing code.

### 2. Two viable shapes — verify which works

- **A. Direct text-to-video:** `generate_video` with the prompt + product screenshot as a reference media.
- **B. Chain:** generate the image first (Phase 4), then feed it as `start_image` to `generate_video`.

Try **A** first — it's one call and Marketing Studio is built for product ads. Fall back to **B** if A can't use the product reference well.

### 3. Reuse what exists

- The courier pattern: Node builds the params object, `JSON.stringify`, agent passes verbatim. **Never prose bullets.**
- Async polling: `generate_video` returns a pending job; poll `job_status` in the same CLI call.
- `VIDEO_TIMEOUT` is already 900s — video generation is slow.
- `duration` comes from the completed job params if present; otherwise `probeDuration()`. **Never fabricate it.**

### 4. Orchestrator

Add the video branch to `generateHiggsfieldContent`, same loop/cancel/error structure as the image path. Populate `duration` on the `GeneratedPost` and set `mediaType: "video"` so `ContentCard` renders a `<video>`.

---

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1        # image, M13 pass condition
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate-video 1  # add this mode
```

Video costs more than images (DoP tiers were 2–9 credits; Marketing Studio may differ). **Preflight with `get_cost` first and report the number before generating.** Run video generation at most twice. Balance ~1597.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — engine wiring is Phase 6.
- Do not modify the Remotion/spec pipeline.
- **Do NOT commit.**
- Paste literal output, including `input_images` and the cost preflight.
