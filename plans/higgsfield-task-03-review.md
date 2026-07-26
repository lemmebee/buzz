# TASK 03 (Phase 3) — CTO Review

**Verdict:** `prompt.ts` and `context.ts` are good work. But Phase 2's upload path is broken in a way that blocks Phase 3 from being testable at all, and it needs a design change.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0, 17s
npm run lint                       → 0 errors, 1 pre-existing warning (settings/page.tsx:135)
```

The earlier `ecosystem.config.js` errors and the `assets.ts` unused-var are gone. Clean.

## Credited

`prompt.ts` is the best round so far:
- **5 named `CREATIVE_ANGLES`** with per-angle `motionHint` — a real solution to variation distinctness, not a token nudge. Exactly the intent.
- One LLM call, `jsonrepair`, `sanitizeCaption`, `composeSkillSection("content")` (verified `"content"` is a valid `EngineId`), `llmInstructions` threaded.
- `planFile` capped at 4000 chars with the reasoning in a comment.
- `motionPrompt` falls back to the angle's hint when the model omits it.
- Anti-cliché rules mirror `sanitizeCaption`'s own list.

`context.ts`: clean `safeJsonParse` with `[higgsfield]` warnings, correct joins for brainstorm ideas and the Instagram handle.

---

## MUST FIX

### M9 — The MCP upload path is wrong, and it blocks everything

Running `--prompt 1` never reached prompt generation. It died in asset upload:

```
[higgsfield] attempt 1 failed: Upload requires user approval for curl command. Retrying...
[higgsfield] attempt 2 failed: Cannot call MCP tool directly from Claude Code harness...
[higgsfield] upload failed: No JSON in CLI output: Awaiting approval for S3 upload via curl.
[higgsfield] attempt 2 failed: No JSON in CLI output: Upload command pending approval.
                                                              7:00 total
```

One upload out of several did succeed (`-> af476c07-c0ee-43dc-84e4-b1f235447bec`), so it's intermittent, not dead — which is worse.

**Root cause.** `media_upload` does not accept bytes. Per its schema it is a **three-step** flow:

1. `media_upload({filename, content_type})` → returns `media_id` + a **presigned `upload_url`**
2. **The client PUTs the bytes to `upload_url`** ← this step is not the MCP's job
3. `media_confirm({media_id, type:"image"})`

Your implementation asks the agent to do step 2 via `curl`, but `--allowedTools` is scoped to the MCP tool only, so Bash isn't permitted. The agent stalls waiting for approval that never comes in `--print` mode.

**Fix — do step 2 in Node, not in the agent:**

```
CLI call 1:  media_upload        → parse { media_id, upload_url }
Node:        await fetch(upload_url, { method: "PUT", body: buffer,
                                       headers: { "Content-Type": contentType } })
CLI call 2:  media_confirm({ media_id, type: "image" })
```

This is faster, deterministic, and avoids granting the agent Bash. Do **not** solve this by adding `Bash(curl:*)` to `--allowedTools` — that widens the agent's permissions for no benefit when Node can PUT the bytes directly.

Note `media_upload` supports `files[]` for batch presigning — one CLI call can presign the logo and all screenshots, then Node PUTs them in parallel, then one `media_confirm({media_ids:[...]})`. That turns ~5 CLI round-trips into 2.

### M10 — `gatherContext` shouldn't force an upload

`context.ts:73` calls `ensureProductAssetsUploaded` unconditionally, so prompt generation cannot be tested without a working upload path. Those concerns are independent.

Add an option (default off for the `--prompt` spike mode) to skip asset resolution, or move the upload call into the orchestrator where the media_ids are actually consumed. **Phase 3 must be verifiable without touching Higgsfield at all** — that was the point of scheduling it before the credit-dependent phases.

---

## SHOULD FIX

### S7 — `icp`, `jtbd`, `targeting`, and `config` are gathered but never used
`context.ts` collects them; `buildSystemPrompt` never references them. `icp` and `jtbd` are the sharpest audience signal Buzz has, and `targeting` is what the user explicitly asked for in the generate UI. Right now they're silently dropped.

Add them to the PRODUCT CONTEXT section (JSON-stringify and truncate the two `unknown` fields defensively).

### S8 — Angles repeat past 5 variations
`prompt.ts:149`: `variationIndex % CREATIVE_ANGLES.length`. `count` is clamped to 10, so variations 6–10 reuse angles 1–5. `temperature: 0.95` gives some drift, but the creative direction is identical.

Either add angles, or pass the already-used angle labels into the prompt and instruct the model to differentiate. Not urgent — `count` is usually ≤ 3.

---

## Tooling — fixed on your behalf

`npx tsc` and `npx tsx` were taking **5+ minutes and timing out**. Cause: `tsx` was never a project dependency, so `npx` re-fetched it from the registry on every run, and `npx tsc` was doing registry lookups too. 2s of CPU, 5 minutes of waiting.

I ran `npm install -D tsx`. Now:

```
./node_modules/.bin/tsc --noEmit    → 17s
./node_modules/.bin/tsx  script.ts  → instant startup
```

**Use `./node_modules/.bin/...` for both from now on, never `npx`.** Worth adding to `package.json`:
```json
"typecheck": "tsc --noEmit"
```
and switching the `test:*` scripts off `npx tsx`.

This also means: earlier "verification passed" reports run through `npx` were likely never running to completion at all.

---

## Verification (paste literal output)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --prompt 1
```

`--prompt 1` must print the assembled prompt, caption, and hashtags for **variations 0, 1 and 2**, and must run without contacting Higgsfield (M10). Paste all three variations so the angles can be judged as genuinely distinct.

Then, separately, once M9 lands:
```
./node_modules/.bin/tsx scripts/test-higgsfield.ts --assets 1
```
Must print media_ids for the logo and screenshots, with no approval stalls.

Still do not commit.
