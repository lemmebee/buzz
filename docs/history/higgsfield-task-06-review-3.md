# TASK 06 (Phase 4) — CTO Review #3

**Verdict:** Not an MCP problem, not a media_id problem. It's the **shape of your prompt**. Verified fix below.

---

## Diagnosis

Your `hfGenerateImage` describes the parameters as a **prose bullet list**:

```
Step 1: Call generate_image with these parameters:
- model: marketing_studio_image
- prompt: Studio product shot...
- aspect_ratio: 1:1
- medias: [{"value":"b1565...","role":"image"}]

CRITICAL: ...you MUST include the medias parameter...
```

That asks the model to **reconstruct** a JSON object from prose. It builds `{model, prompt, aspect_ratio}` — the three "obvious" ones — and drops `medias`. No amount of CRITICAL/MUST shouting fixes this; you're fighting reconstruction, not disobedience. Your instinct that "the LLM is not reliably passing the medias parameter" was right; the cause is that you asked it to retype the object instead of handing it one.

## The fix: serialize the params in Node, pass them verbatim

Build the complete params object in TypeScript, `JSON.stringify` it, and tell the agent to pass it **exactly**.

**Verified live just now — `input_images` came back populated on the first attempt:**

```
Call the mcp__claude_ai_HiggsField__generate_image tool with the params argument set to
EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

{"model":"marketing_studio_image","prompt":"Studio product shot of the app on a phone,
warm neutral backdrop, soft light","aspect_ratio":"1:1",
"medias":[{"value":"b1565f5e-0097-494d-81c7-e995435b5781","role":"image"}]}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly
until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}
```

Response:
```json
{"status":"ok","url":"https://.../hf_20260726_163955_bb917531....png",
 "job_params":{"prompt":"Studio product shot...","aspect_ratio":"1:1",
 "input_images":[{"id":"b1565f5e-0097-494d-81c7-e995435b5781","type":"media_input",
                  "url":"https://.../b1565f5e-..._resize.jpg"}],
 "width":1024,"height":1024,"resolution":"1k","batch_size":1}}
```

Same media_id you were already using. Same model. Same role. **Only the prompt form changed.**

### Implementation

```ts
const params: Record<string, unknown> = {
  model,
  prompt: opts.prompt,
  aspect_ratio: opts.aspectRatio,
  ...(opts.seed != null ? { seed: opts.seed } : {}),
  ...(opts.medias?.length ? { medias: opts.medias } : {}),
};

const prompt = `Call the mcp__claude_ai_HiggsField__generate_image tool with the params argument set to EXACTLY this JSON object, verbatim, with no fields added, removed, or altered:

${JSON.stringify(params)}

Then take the returned job id and call mcp__claude_ai_HiggsField__job_status repeatedly until status is "completed" or "failed" (max 20 polls, respect poll_after_seconds).

Then output ONE line of JSON and nothing else:
{"status":"ok","url":"<result_url>","job_params":<the params object from job_status>}`;
```

Drop the bullet list and the CRITICAL paragraph entirely.

**Apply the same pattern to `hfGenerateVideo`, `hfPresignUpload`, `hfConfirmUpload`, `hfGetCost` and `hfBalance`.** Any call whose arguments are described in prose will lose fields sooner or later. This is the general rule for this transport: **Node owns the params object; the agent is a courier, not an author.**

Keep the empty-`input_images` warning — it's how this stays caught.

---

## Verified on your tree

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning
```

Your report says "3 errors" for the fifth time. There are **0**. Please copy the command's actual output.

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1
```

Pass condition: `params.input_images` is **non-empty** and the saved image shows the real Tanda UI (dark theme, TANDA. wordmark, green mic, "Hold to speak"). Paste the `input_images` field.

At most two runs (~2 credits each; balance ~1603).

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion pipeline.
- **Do NOT commit.**
