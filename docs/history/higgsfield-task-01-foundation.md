# TASK 01 — Higgsfield Engine: Phase 1 (Foundation)

**To:** Full-stack developer
**From:** CTO
**Plan:** `plans/higgsfield-engine.md` (authoritative spec — read it in full first)
**Scope:** Phase 1 ONLY. Do not start Phases 2–7.

---

## Assignment

Read `plans/higgsfield-engine.md` completely before writing any code, then implement **section 5, "Phase 1 — Foundation: SDK, settings, client wrapper"**.

Do NOT implement: the orchestrator, context assembler, prompt shaper, asset upload, DB tables, or any UI. Stop when Phase 1 is done and report back.

---

## Deliverables

### 1. Install the SDK
```bash
npm install @higgsfield/client
```

### 2. Spike S2 — do this early, it shapes the code
After install, inspect `node_modules/@higgsfield/client`: its `package.json` exports, `.d.ts` type definitions, and the v2 entrypoint.

**Determine:** does the **v2** client expose upload methods (`uploadImage` / `upload`), or do those exist only on the **v1** client? The README documents them under v1 only.

Your `client.ts` must work with whatever is actually there. If v2 lacks upload, export a v1 instance used **solely** for uploads. **Report what you find.**

### 3. Settings plumbing — `src/lib/settings.ts`
Add, following the exact existing getter pattern (DB setting → env → default):
- `getContentEngine()` → `CONTENT_ENGINE`, default **`"buzz"`**
- `getHiggsfieldImageModel()` → `HIGGSFIELD_IMAGE_MODEL`, default `"flux-pro/kontext/max/text-to-image"`
- `getHiggsfieldVideoModel()` → `HIGGSFIELD_VIDEO_MODEL`, default `"/v1/image2video/dop"`

### 4. Security fix — `src/app/api/settings/route.ts`
Add `_CREDENTIALS` to the secret-masking regex `/(_API_KEY|SECRET|TOKEN|PASSWORD)$/i` so `HIGGSFIELD_CREDENTIALS` is masked on GET. Verify it still masks everything it masked before.

### 5. `src/lib/higgsfield/client.ts`
The four exported functions from plan §5 Phase 1.3:
```ts
export async function getHiggsfieldClient(): Promise<HiggsfieldClient>   // throws if creds missing
export async function hfGenerateImage(opts: { prompt: string; aspectRatio: string; seed?: number }): Promise<{ url: string; localPath: string }>
export async function hfGenerateVideo(opts: { prompt: string; startImageUrl: string; duration?: number }): Promise<{ url: string; localPath: string; duration: number }>
export async function hfUpload(buffer: Buffer, contentType: string): Promise<string>
```
- Credentials via `getApiKey("HIGGSFIELD_CREDENTIALS")` — **never** bare `HF_*` env vars.
- Read `src/lib/providers/image.ts` (~lines 40–47) first and mirror its download-and-write-to-`public/media` pattern so file naming and the returned `/api/media/...` URL shape match exactly.
- Naming: `hf-<timestamp>.<ext>`.

### 6. Error mapping — `src/lib/providers/errors.ts`
Extend `classifyProviderError` and `isTerminalProviderError` per plan §5 Phase 1.4:
- **Terminal:** `AuthenticationError`, `NotEnoughCreditsError`
- **Non-terminal:** `BadInputError`, `ValidationError`, NSFW, failed jobs

Read the existing file first and match its structure. Do not restructure it.

### 7. `.env.example`
Add `HIGGSFIELD_CREDENTIALS=` and `CONTENT_ENGINE=buzz`.

### 8. `scripts/test-higgsfield.ts`
The spike harness. Read an existing `scripts/test-*.ts` first and match its conventions.

It should: config the client → one text-to-image → print the result URL → download it → one image-to-video off that frame.

It must fail with a clear **"credentials not configured"** message rather than a stack trace when creds are absent.

---

## Verification (required before reporting done)

```bash
npm run lint            # clean
npx tsc --noEmit        # clean
npx tsx scripts/test-higgsfield.ts
```

The script must exit with the clean "credentials missing" message. **We do not have Higgsfield credentials yet**, so live calls cannot be tested — that is expected and fine.

---

## Hard constraints

- **Additive only.** Do NOT modify or refactor the existing spec/Remotion/creative-director pipeline. Do NOT touch `src/lib/generate.ts` in this phase.
- TypeScript strict. No test framework in this repo — verification is lint + tsc + tsx scripts.
- Match surrounding code style exactly. No speculative abstractions, no extra config, nothing beyond the list above.
- **Do NOT commit.** Leave changes in the working tree for CTO review.
- If anything in the plan is wrong, ambiguous, or conflicts with the code, **STOP and report** rather than guessing.

---

## Report back with

1. The **S2 finding** (v1 vs v2 upload)
2. Files created/modified
3. `lint` / `tsc` / script output
4. Anything in the plan you think the CTO got wrong
