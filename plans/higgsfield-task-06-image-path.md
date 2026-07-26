# TASK 03 — APPROVED ✅ / TASK 06 — Phase 4: Image Generation Path

**Plan:** `plans/higgsfield-engine.md`
**Scope:** Phase 4 only. Do not start Phases 5–7.

---

## Part 1 — Phase 3 sign-off

All review items verified independently on your tree.

| Item | Result |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0, 17s ✅ |
| `npm run lint` | 0 errors, 1 pre-existing warning ✅ |
| **M9** upload path | ✅ 4 screenshots → real media_ids, **no curl approval stalls** |
| **M10** `skipAssetUpload` | ✅ prompt mode runs without touching Higgsfield |
| **S7** icp/jtbd/targeting/config | ✅ in the prompt |
| **S8** angle repetition | ✅ `usedAngles` threaded |

**The output is genuinely good.** Three variations for Tanda:

- **V0 (Product Hero):** phone centred, studio lighting, sage green + charcoal on desert sand, generous negative space
- **V1 (Lifestyle Context):** phone on a table at evening, tea nearby, shallow depth of field
- **V2 (Bold Abstract):** layered triangular awning forms, flat graphic, sound-wave motif

Genuinely distinct compositions, brand palette correctly pulled from `profile.visualIdentity`, captions on-message (voice, privacy, zero-based budget) with no em dashes and no clichés. The `CREATIVE_ANGLES` design works — that was the risky part of this phase and it landed.

**Task 03 accepted.**

### Note on your report

`npm run lint → 3 pre-existing errors` — there is exactly **1** pre-existing warning and **0** errors. You were also still running `npx tsc`; use `./node_modules/.bin/tsc`. Minor, but report what the command prints.

### Known issue (NOT yours — user config)

`--prompt 1` initially failed all three variations with *"Failed to extract JSON from text provider response"*. Cause: `TEXT_PROVIDER` is `antigravity:Gemini 3.5 Flash (High)`, which ignores prompts and replies with meta-answers (asked for JSON, returned *"I am running on Gemini 3.5 Flash (High)."*). `GOOGLE_AI_API_KEY` is empty.

I verified Phase 3 by temporarily pointing product 1 at `claude-code:haiku`, which returns clean JSON, then restored the original setting. **Your code is correct.** The provider choice is the user's call.

---

## Part 2 — Task 06 assignment: Phase 4, image path

Build the orchestrator's image branch. This is where the pieces join up.

### 1. `src/lib/higgsfield/orchestrator.ts`

```ts
export async function generateHiggsfieldContent(
  input: GenerateContentInput & { config: ContentConfig },
  hooks?: GenerationHooks
): Promise<GenerateContentResult>
```

Must match the two existing orchestrators exactly — see `src/lib/image/orchestrator.ts` for the contract:

- Return `{ posts, errors }`. **Never throw** for a per-variation failure; accumulate `GenerationFailure { index, message, terminal }`.
- `message` via `classifyProviderError`, `terminal` via `isTerminalProviderError`. **Break the batch on terminal.**
- Call `hooks.onPost(posts, errors)` after each variation; poll `hooks.shouldCancel()` before each.
- Clamp `count` to 1..10.
- `gatherContext()` **once**, outside the loop. `buildHiggsfieldPrompt(ctx, i)` per variation, threading `usedAngles`.

Loop shape:
```
ctx = gatherContext({ ...input })            // once
for i in 0..count-1:
  if await hooks.shouldCancel() -> break
  try:
    p   = buildHiggsfieldPrompt(ctx, i, usedAngles)
    img = hfGenerateImage({ prompt: p.imagePrompt, aspectRatio: mapSurface(...), medias })
    posts.push({ content: p.caption, hashtags: p.hashtags, mediaUrl: img.url, config, metadata })
  catch e:
    errors.push({ index: i, message: classifyProviderError(e), terminal: isTerminalProviderError(e) })
    if terminal -> break
  await hooks.onPost?.(posts, errors)
```

### 2. Aspect-ratio mapping

`targetSurface` → `aspect_ratio`:
```
post   -> "1:1"
story  -> "9:16"
reel   -> "9:16"
ad     -> "4:5"
```
Unknown → `"1:1"` with a `[higgsfield]` warning.

### 3. Pass product assets as reference media

`ctx.logoMediaId` and `ctx.screenshotMediaIds` exist and are proven working. Pass them to `hfGenerateImage` as `medias[]` so Higgsfield renders the **real** product, not an invented one.

Per the MCP schema, each entry is `{ value: <media_id>, role: <role> }` — `value` must be a media_id, never a URL. Extend `hfGenerateImage`'s options with an optional `medias` array.

**Cap at 2–3 references.** Do not send all four screenshots.

### 4. `metadata`

Must satisfy `GenerationMetadata`. Record `engine: "higgsfield"`, the model slug used, the credits consumed if available, and the angle label for the variation (useful when judging output later).

---

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
```

Then a **single** real generation — this spends credits (~2 per image):
```
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1
```

Add that mode if it doesn't exist: generate **one** image for product 1 and print the local path + credits used.

**Budget: run this at most twice.** Balance is 1615 credits; each image is ~2. Do not loop.

Report the saved file path so the image can be inspected.

---

## Time and tooling discipline

- **Always** `./node_modules/.bin/tsc` and `./node_modules/.bin/tsx`. Never `npx` — it hits the npm registry and takes 5+ minutes.
- Expected timings: `tsc` ~17s, CLI+MCP calls 20–60s, asset upload ~5min cold / instant cached, image generation 30–90s.
- Give commands a 300000ms timeout. If one genuinely exceeds it, **stop and report** — do not retry in a loop. A previous agent burned 70 minutes that way.
- `exit code null` = your own timeout fired. `143` = SIGTERM. Neither means the CLI is broken.

## Hard constraints

- Do NOT touch `src/lib/generate.ts` — engine wiring is Phase 6.
- Do NOT modify the Remotion/spec pipeline.
- **Do NOT commit.**
- Paste literal command output. "Compiles cleanly" without output is not acceptable.

## Report back with

1. Files created/modified
2. Literal output of `tsc` and `lint`
3. The generated image's path and the credits consumed
4. Anything in the plan that looks wrong
