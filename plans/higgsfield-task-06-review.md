# TASK 06 (Phase 4) — CTO Review

**Verdict:** Changes requested. One missing step — the MCP is asynchronous and the client treats it as synchronous.

The orchestrator itself is right. Everything around the generation call worked on the first real run.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning (settings/page.tsx:135)
```

Note: your report said "3 errors, 1 warning". There are **0 errors**. Third round with a miscounted lint number — paste the output.

## What worked on the live run

```
[higgsfield] all assets already uploaded for product 1     ← Phase 2 cache hit, no re-upload
[higgsfield] variation 1/1 failed: No URL in Higgsfield response
  Progress: 0 posts, 1 errors
Result: 0 posts, 1 errors
  [0] Something went wrong... (terminal: false)
```

Asset caching, the variation loop, `onPost` progress reporting, error accumulation without throwing, and correct non-terminal classification — all behaved exactly as specified. Only the response handling is wrong.

---

## MUST FIX

### M11 — `generate_image` is async; it returns a job, not a URL

I called the tool directly. The response is:

```json
{"results":[{"id":"09bfbdd4-933b-4d73-b88e-b45f68857fd5",
             "type":"image","status":"pending",
             "model":"marketing_studio_image"}]}
```

**No URL — `status: "pending"` and a job id.** Your parser looks for a URL that cannot be there yet, hence "No URL in Higgsfield response".

Polling `job_status` with that id returns, while running:
```json
{"generation":{"status":"in_progress",...},"poll_after_seconds":2}
```

and on completion:
```json
{"id":"09bfbdd4-...","status":"completed",
 "result_url":"https://d8j0ntlcm91z4.cloudfront.net/.../hf_20260726_130409_....png",
 "min_result_url":"https://.../..._min.webp",
 "params":{"width":1024,"height":1024,"aspect_ratio":"1:1"}}
```

`result_url` is the full-resolution asset. **I downloaded it: a real 1024×1024 PNG, sage-green phone on desert sand, correctly on-brand.** Generation works — only retrieval is missing.

### The fix: let the agent poll inside a single CLI call

Do **not** poll from Node with repeated CLI spawns — each spawn costs ~20s, so a 5-poll job would take 100s of pure overhead.

Instead, make it one CLI call that does generate-then-poll, with both tools allowed:

```
--allowedTools 'mcp__claude_ai_HiggsField__generate_image' \
--allowedTools 'mcp__claude_ai_HiggsField__job_status'
```

Prompt instruction, roughly:
> Call `generate_image` with these params. Take the returned job id. Then call `job_status` repeatedly until `status` is `completed` or `failed`, respecting `poll_after_seconds` (cap at ~20 polls). Then output ONE line of JSON: `{"status":"ok","url":"<result_url>","jobId":"<id>"}` or `{"status":"error","message":"..."}`. Output nothing else.

I verified this pattern works — the agent polled to completion and returned the full JSON in a single call, in about 20 seconds.

Then `downloadToMedia(url, "png")` as today. Note the result is a **PNG**, not a JPEG — derive the extension from the URL or the content-type rather than hardcoding `"jpg"` (this finally closes the long-deferred S4).

Apply the same pattern to `hfGenerateVideo` in Phase 5 — `generate_video` will be async too.

---

## SHOULD FIX

### S9 — `credits` is not in the response
Your `hfGenerateImage` returns a `credits` field, but neither `generate_image` nor `job_status` reports credits spent. Either drop it, or call `generate_image` with `get_cost: true` **first** to preflight (free), and record that number. Do not report a fabricated figure — that was M1 in an earlier round.

### S10 — Verify `medias[]` actually reaches the model
The direct call I made had `"input_images": []` in the completed job's params, because I passed no medias. When you pass `ctx.screenshotMediaIds`, confirm the completed job echoes them in `params.input_images`. If it comes back empty, the role name or the value format is wrong and the product screenshots are being silently ignored — which would defeat the point of Phase 2.

---

## Verification

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --generate 1
```

Must print a saved path under `public/media/` and produce a viewable image. **Run at most twice** (~2 credits each; balance is ~1611).

Report the saved path and paste the completed job's `params.input_images` so S10 can be judged.

## Constraints

- `./node_modules/.bin/...` always. Never `npx`.
- Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion pipeline.
- **Do NOT commit.**
- Paste literal output.
