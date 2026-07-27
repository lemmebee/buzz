# TASK 08 — Switch video to DoP (30× cheaper) + Phase 6 prep

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
>
> Do **not** run `--generate`, `--generate-video`, or any `generate_image` / `generate_video` / `generate_audio` call while working this task. Not to verify, not once, not "just to check".
>
> **Allowed (free):** `./node_modules/.bin/tsc --noEmit`, `npm run lint`, `--balance`, `--cost`, `--prompt`, and reading files already in `public/media/`.
>
> If you believe a real generation is required, **stop and ask**, stating the credit cost. The owner decides.
>
> Balance: **1441.15 credits.** Image ~2, `marketing_studio_video` ~60, `dop/turbo` ~6.5.

---

## Context

Your `--cost` preflight returned:

```
Image cost:  2 credits
Video cost:  60 credits
```

60 credits per video is unsustainable — that's ~24 videos on the remaining balance, and a scheduled worker would drain it in under a month.

`marketing_studio_video` is the premium tier. The DoP family is far cheaper:

| Model | Credits |
|---|---|
| `marketing_studio_video` | 60 |
| `higgsfield-ai/dop/standard` | 9 |
| `higgsfield-ai/dop/turbo` | 6.5 |
| `higgsfield-ai/dop/lite` | 2 |

DoP is **image-to-video**, which matches the chain this plan specified from the start: generate the still (2 cr), then animate it (6.5 cr) — **~8.5 credits per video instead of 60.** Roughly 170 videos instead of 24.

Trade-off: we lose Marketing Studio's built-in ad structure and native audio. We keep the real product on screen, brand-accurate, with motion. Worth it at 7× the volume.

---

## Work

### 1. Change the default video model
`src/lib/settings.ts`: `getHiggsfieldVideoModel()` default → `higgsfield-ai/dop/turbo`.

### 2. Confirm the DoP contract before coding
```
models_explore(action:'get', model_id:'higgsfield-ai/dop/turbo')
```
This is a **read-only** call and costs nothing. Record the declared `medias[].roles`, `aspect_ratios`, and any `duration` support in `plans/higgsfield-engine.md`.

Do not assume the image model's rules carry over. Two known traps from the image path:
- the role string must match exactly what the model declares
- `marketing_studio_image` accepts exactly **one** reference media; DoP may differ

### 3. Implement video as a two-step chain
```
step 1: hfGenerateImage(...)        -> still (2 cr), already working
step 2: DoP image-to-video with that still as start_image (6.5 cr)
```
Reuse everything already proven:
- **Courier pattern** — Node builds the params object, `JSON.stringify`, agent passes it verbatim. Never prose bullets; that is what silently dropped `medias` before.
- **Async polling** — `generate_video` returns a pending job; poll `job_status` in the same CLI call.
- `VIDEO_TIMEOUT` is already 900s.
- `duration` from the completed job params, else `probeDuration()`. **Never fabricate it.**

### 4. Cost preflight before every video
Call `get_cost` and include the number in the log line and in `GeneratedPost.metadata`. Video is expensive enough that the cost must be visible, not silent.

### 5. Phase 6 note — do not wire video into the scheduled worker
When engine wiring lands, **images may run in the scheduled worker; video must be user-triggered only**, with the credit cost shown before generating. A cron job that quietly spends 6.5–60 credits per run is not acceptable.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --cost
```

Expected after the model change: image ~2, video ~6.5 (down from 60). **Paste that output** — the cost drop is the deliverable for this task.

**Do not run `--generate-video`.** The owner will decide when a real video test happens.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — engine wiring is Phase 6.
- Do not modify the Remotion/spec pipeline.
- **Do NOT commit.**
- Paste literal output. Report lint counts exactly as printed.
