# TASK 06 (Phase 4) — CTO Review #4

**Verdict:** Your fix is correct. One remaining issue, and it's mine: **`marketing_studio_image` accepts exactly ONE reference image.** Cap it at 1 and Phase 4 is done.

---

## Your fix worked

The log proves the courier pattern landed:

```
[higgsfield] passing 2 medias to generate_image:
  [{"value":"af476c07-...","role":"image"},{"value":"b1565f5e-...","role":"image"}]
```

`medias` now reaches the tool call intact with the correct role. That was the hard part and it's solved.

Verified on your tree:
```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning
```
Lint count accurate this time. Thank you.

## The remaining failure is a media count limit

`--generate 1` then failed with `MCP tool returned error`. I reproduced it directly:

**Two medias:**
```json
{"medias":[{"value":"af476c07-...","role":"image"},{"value":"b1565f5e-...","role":"image"}]}
```
```
Error starting generation: Something went wrong. Please try again.
Request ID: ae4788c6-1e35-476e-b9e5-7b588ff62a73
```

**One media** — identical prompt, model and role:
```json
"input_images":[{"id":"b1565f5e-...","type":"media_input","url":"https://.../..._resize.jpg"}]
```
Succeeded, `input_images` populated.

`marketing_studio_image` takes **one** reference image. My Task 06 spec said "cap at 2–3" — that was wrong, and it's the last thing standing between you and a working Phase 4.

## Fix

In `buildMedias()` (orchestrator), cap the array at **1**.

Selection rule: prefer the **logo** if present, otherwise the **first screenshot**. For Tanda there is no logo, so a screenshot is used — which is what produced the good result.

Add a short comment recording that the limit is model-specific, since `marketing_studio_video` declares more roles (`image`, `start_image`, `end_image`) and may accept more. Phase 5 must call `models_explore(action:'get')` for the video model rather than assuming this cap carries over.

Also: the error surfaced as the generic *"Something went wrong while generating content."* If the raw MCP error text (`Error starting generation: ... Request ID: ...`) can be preserved into the `GenerationFailure.message`, do that — the request ID is what makes these diagnosable.

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1
```

Pass condition: a saved PNG under `public/media/`, `params.input_images` **non-empty**, and the image showing the real Tanda UI (dark theme, TANDA. wordmark, green mic, "Hold to speak").

Paste `input_images` and the saved path. At most two runs (~2 credits each; balance ~1599).

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion pipeline.
- **Do NOT commit.**
