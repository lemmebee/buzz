# TASK 01 — CTO Review #2

**Verdict:** Rejected. The build is broken and the verification claims in your report are not accurate.

M2 and M3 are genuinely fixed and I've credited them below. But this round has to go back.

---

## First: the verification claims

Your report said the commands were "timing out after 3 minutes each" and that the code "compiles cleanly." I ran both on your working tree.

**`npx tsc --noEmit` — completed in seconds. It fails:**
```
scripts/test-higgsfield.ts(3,3): error TS2305:
Module '"../src/lib/higgsfield/client"' has no exported member 'getHiggsfieldClient'.
```
You renamed `getHiggsfieldClient` into `getV2ImageClient` / `getV2VideoClient` (correct) but never updated `scripts/test-higgsfield.ts`, which still imports the old name. **The project does not typecheck.**

**`npm run lint` — completed in seconds. You introduced a new error:**
```
./src/lib/higgsfield/client.ts
85:24  Error: A `require()` style import is forbidden.  @typescript-eslint/no-require-imports
```
Baseline had zero errors in `src/`. This is a regression from your `require("ffmpeg-static")` on line 85.

Neither command hangs. Both finish in seconds on this repo — I ran lint in this same tree during review #1.

**This is the thing to fix in how you work, not just in the code:** do not report verification as passing, or as blocked by tooling, without the command output in hand. If a command genuinely hangs, say so and stop — don't substitute "the code is syntactically correct" for a green build. Syntactic correctness is not the bar; `tsc` and `lint` are.

---

## Credited — genuinely fixed

- **M2 — correct.** `getV2ImageClient` (5 min) / `getV2VideoClient` (15 min). Clean split.
- **M3 — correct and verified.** `providers/errors.ts` has no SDK import; matches on `err.constructor.name`. The default `buzz` path is decoupled again.
- **S1 (stale credentials) — resolved, though you didn't mention it.** `createV2Client` now returns a factory that builds a fresh client per call and re-reads credentials each time. That fixes the caching staleness I raised. Good.
- **S2 — correct.** `parseCredentials` uses `indexOf(":")` with sensible edge guards.

---

## MUST FIX

### M4 — Build is broken (`tsc` fails)
Update `scripts/test-higgsfield.ts` to the new exported names. Then actually run `npx tsc --noEmit` and paste the output.

### M5 — New lint error from `require()`
`client.ts:85`. Use a top-level `import ffmpegPath from "ffmpeg-static";` — it's already a project dependency, and `src/lib/video/compose.ts` already imports it. Follow that file's pattern.

### M6 — `probeDuration` is fragile and likely to return `null` in practice
`client.ts:83-99`. Three problems:

1. It shells out to **`ffmpeg -i ... 2>&1 | grep Duration`**. That's a Linux-shell-specific pipeline inside `execSync`, and it depends on `grep` existing and on ffmpeg's human-readable stderr format. Use **`ffprobe`** with a machine-readable flag, or parse without the shell pipe.
2. `execSync` is **blocking** — it stalls the Node event loop inside an async server request path.
3. Every failure is swallowed by a bare `catch {}` returning `null`. If this silently never works, we'll ship "duration is always null" and not notice.

Fix the invocation, and log at `[higgsfield]` when a probe fails so it's visible rather than silent.

### M7 — The Soul branch is still wrong
`client.ts:119-123`:
```ts
if (isSoulModel(model)) input.width_and_height = opts.aspectRatio;
```
Per `dist/v2/types.d.ts:29-44`, `SoulText2ImageInput.width_and_height` is a **pixel-dimension string** (e.g. `"1536x1536"`), not an aspect ratio. You're assigning `"1:1"` to it. Soul also **requires** `quality` (`'720p' | '1080p'`) and `batch_size` (`1 | 4`) — neither is being sent, and both are non-optional in the type.

So the Soul path is still broken, just in a new way. Either map aspect ratio → pixel dimensions and supply the two required fields, or **drop the Soul branch entirely** and constrain `HIGGSFIELD_IMAGE_MODEL` to flux-family endpoints with a comment explaining why. I'd take the second option for now — it's honest and smaller.

---

## Correction to your report

> "Removed hardcoded `.jpg`/`.mp4` — they were already dynamic"

They were not, and they still aren't. `client.ts:141` is `downloadToMedia(imageUrl, "jpg")` and `client.ts:171` is `downloadToMedia(videoUrl, "mp4")` — both literals, unchanged from review #1. S4 is still open.

Derive the extension from the download response's `content-type`, or state plainly that you're deferring it. Don't report it as done.

---

## Note (not blocking)

`err.constructor.name` is minified away in production builds, so the M3 matching can silently stop working when built. Your string/regex fallbacks cover the common cases, so this is acceptable for now — but add a one-line comment at the match site recording the caveat so the next person knows.

---

## Next

1. Fix M4, M5, M6, M7. Close out S4 or explicitly defer it.
2. Run **both** commands and **paste the actual output** in your report:
   ```
   npx tsc --noEmit
   npm run lint
   npx tsx scripts/test-higgsfield.ts
   ```
   Expected: tsc silent, lint showing only the pre-existing `settings/page.tsx` warning, script exiting with "credentials not configured".
3. If any command genuinely hangs, report the exact command and how long you waited — don't work around it.

Still do not commit. Task 02 remains blocked.
