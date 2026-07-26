# Higgsfield Content Engine — Implementation Plan

> ## ⛔ RULE 0 — NEVER GENERATE ASSETS WITHOUT EXPLICIT PERMISSION
>
> **Nobody — not Claude, not the developer, not any subagent — runs a Higgsfield generation without the owner asking for that specific run.**
>
> Forbidden without per-request permission: `--generate`, `--generate-video`, and any `generate_image` / `generate_video` / `generate_audio` call.
>
> **Measured costs:** image ~2 credits · `marketing_studio_video` ~60 credits · `dop/turbo` ~6.5 credits.
>
> **Always allowed (free):** `tsc`, `lint`, `--balance`, `--cost` (`get_cost` preflights without generating), `--prompt` mode, and inspecting files already on disk.
>
> Verify generation code by reading it and by running the **free** checks. If a real generation is genuinely required, **ask first and state the credit cost.** Never assume a yes.
>
> Balance as of 2026-07-26: **1441.15** (down from 1615.15; 174 spent on verification that should not have happened).


**Status:** Ready for implementation
**Owner (review/architecture):** CTO
**Implementer:** Full-stack developer
**Created:** 2026-07-25

---

## 1. Goal

Add **Higgsfield** as an alternative *content engine* for Buzz.

When enabled, Buzz's role shrinks to exactly one job: **assemble everything it knows about a product and instruct Higgsfield.** Higgsfield does 100% of the creative work — composition, art direction, typography, motion.

**Explicitly out of scope / bypassed when this engine is active:**
- The creative-director spec pipeline (`src/lib/image/select.ts`, `spec-author.ts`, `render-spec.ts`, `vision-judge.ts`)
- The Remotion compositor (`ImageComposition`, `SpecVideo`, `DepthStack`, showcase, emphasis, typography engine)
- The ffmpeg scene compositor (`src/lib/video/compose.ts`)
- Multi-candidate generation, vision judging, revise loops

None of that code is deleted. It stays as the default `buzz` engine. This feature is **additive and switchable.**

### Design principle

> Buzz assembles context and writes the prompt. Higgsfield makes the media. Buzz stores the result.

---

## 2. Architecture

### 2.1 Insertion point

The dispatcher `generateContent()` in `src/lib/generate.ts` (currently 8 lines of branching) is the **single insertion point**. A new engine branch goes in front of the existing mediaType branch:

```ts
export async function generateContent(input, hooks) {
  const config = { ...getDefaults(targetSurface, mediaType), ...(userConfig || {}) };

  const engine = await resolveContentEngine(input.productId);   // NEW
  if (engine === "higgsfield") {                                 // NEW
    const { generateHiggsfieldContent } = await import("@/lib/higgsfield/orchestrator");
    return generateHiggsfieldContent({ ...input, config }, hooks);
  }

  if (mediaType === "video") { /* unchanged */ }
  /* unchanged */
}
```

**Why here:** everything upstream and downstream is reused for free — `POST /api/generate`, the `jobs` table, `processJob`, fire-and-forget processing, the 2s client polling in `src/app/generate/page.tsx`, cancel support, `GeneratedPost` shape, `classifyProviderError`, and persistence via `POST /api/posts`. No API route changes. No UI changes to the generate flow.

**Contract the new orchestrator MUST satisfy** (identical to the two existing orchestrators):

```ts
generateHiggsfieldContent(
  input: GenerateContentInput & { config: ContentConfig },
  hooks?: GenerationHooks
): Promise<GenerateContentResult>
```

- Return `{ posts: GeneratedPost[], errors: GenerationFailure[] }` — **never throw** for per-variation failures; accumulate into `errors`.
- Honour `hooks.onPost(posts, errors)` after each variation and `hooks.shouldCancel()` before each variation.
- Break the batch on terminal errors (`isTerminalProviderError`).
- `mediaUrl` must be a `/api/media/...` URL so `ContentCard` renders it.
- `mediaType` must be `image` or `video`.

### 2.2 New module layout

```
src/lib/higgsfield/
  client.ts        # SDK wrapper: config, subscribe, poll, download-to-media
  assets.ts        # upload product assets to HF CDN + cache URLs in DB
  context.ts       # gather ALL product context into one structured object
  prompt.ts        # context -> Higgsfield prompt (one LLM "shaper" call)
  orchestrator.ts  # generateHiggsfieldContent — image + video paths
  types.ts         # local types
```

### 2.3 Data flow

```
GenerateContentInput (productId, mediaType, targetSurface, count, config)
   |
   +-> context.ts   gather: name, description, planFile, profile, marketingStrategy,
   |                        icp, jtbd, channelHints, llmInstructions, brainstorm ideas,
   |                        IG handle, skill packs, config/targeting
   |
   +-> assets.ts    ensure logo + screenshots are uploaded to HF CDN (cached)
   |                        -> public https URLs
   |
   +-> prompt.ts    one TextProvider call: context -> tight HF creative prompt
   |                        + caption + hashtags (reuse existing prompt builders)
   |
   +-> client.ts    IMAGE: subscribe(text-to-image, {prompt, aspect_ratio, ...})
   |                VIDEO: subscribe(text-to-image) -> subscribe(image2video, start frame)
   |                        -> poll -> download bytes -> public/media/hf-*.{jpg,mp4}
   |
   +-> GeneratedPost { content, hashtags, mediaUrl: "/api/media/hf-*.jpg", metadata }
```

---

## 3. External contract (verified from the official SDK)

Package: **`@higgsfield/client`** — official Node/TS SDK (github.com/higgsfield-ai/higgsfield-js, MIT).
Base URL: `https://platform.higgsfield.ai`. **Server-side only** (browser blocked — fine, we call from Next server).

### Auth
```
HF_CREDENTIALS = "KEY_ID:KEY_SECRET"     # preferred
# or HF_API_KEY + HF_API_SECRET
```
Keys are issued from the **Higgsfield Cloud dashboard at https://cloud.higgsfield.ai** — this is the *developer platform*, a different product from the interactive MCP/CLI integration. Credit-based; a paid tier is required.

> **Do not** name our env var `HF_API_KEY` — the codebase already uses `HUGGINGFACE_API_KEY` for HuggingFace and `HF_*` would be dangerously confusable. Use **`HIGGSFIELD_CREDENTIALS`** in Buzz settings and pass it explicitly into the SDK `config()`.

### v2 client — generation
```ts
import { createHiggsfieldClient } from '@higgsfield/client/v2';

const client = createHiggsfieldClient({
  credentials: 'KEY_ID:KEY_SECRET',
  timeout: 120000,        // 2 min HTTP
  maxRetries: 3,
  pollInterval: 2000,
  maxPollTime: 300000,    // 5 min — SEE RISK R3
});

const jobSet = await client.subscribe('flux-pro/kontext/max/text-to-image', {
  input: { prompt, aspect_ratio: '1:1', safety_tolerance: 2, seed },
  withPolling: true,
});

if (jobSet.isCompleted) {
  const url = jobSet.jobs[0].results?.raw.url;   // raw = full res, min = thumbnail
}
```

**JobSet flags:** `isCompleted`, `isQueued`, `isInProgress`, `isFailed`, `isNsfw`.
**Job statuses:** `queued | in_progress | nsfw | failed | completed | canceled`.
`nsfw` and `failed` refund credits — treat both as **non-terminal per-variation failures**, not batch killers.

### Endpoints — VERIFIED AGAINST THE LIVE API (2026-07-25)

> The README's `flux-pro/kontext/max/text-to-image` example **does not exist** — it returns 404.
> Everything below was probed against `platform.higgsfield.ai` with real credentials.

**Only three POST endpoints exist:**

| Purpose | Endpoint | Required fields |
|---|---|---|
| Text-to-image | `/v1/text2image/soul` | `prompt`, `width_and_height` |
| Image-to-video | `/v1/image2video/dop` | `prompt`, `input_images` |
| Speech-to-video | `/v1/speak/higgsfield` | `input_image`, `input_audio` (WAV) |

**There is no text-to-video endpoint.** Video is necessarily a two-call chain: text2image → image2video. (Plan §5 Phase 5 already assumed this — confirmed correct.)

#### CRITICAL: the request body must be wrapped in `params`

The API expects `{ "params": { ... } }`. The v2 SDK sends the `input` object **directly** as the request body (`dist/v2/client.js`: `const requestBody = { ...input }`). Therefore calls must be made as:

```ts
client.subscribe("/v1/text2image/soul", {
  input: { params: { prompt, width_and_height: "1536x1536" } },
  withPolling: true,
});
```

Omitting the wrapper yields `422 {"detail":[{"loc":["body","params"],"msg":"Field required"}]}`.

#### Model catalog — `GET /models` (13 models, resolves spikes S3 + S4)

`GET https://platform.higgsfield.ai/models` with `Authorization: Key KEY_ID:KEY_SECRET` returns the live catalog with per-model credit costs. Model is passed as a `model` slug inside `params`.

| Slug | Type | Credits |
|---|---|---|
| `higgsfield-ai/soul/v2/standard` | text2image | 0.0 |
| `higgsfield-ai/soul/cinema` | text2image | 0.0 |
| `higgsfield-ai/soul/standard` | text2image | 1.0 |
| `higgsfield-ai/soul/character` | text2image | 1.0 |
| `higgsfield-ai/soul/reference` | text2image | 1.0 |
| `higgsfield-ai/popcorn/auto` | text2image | 1.472 |
| `higgsfield-ai/dop/lite` | image2video | 2.0 |
| `higgsfield-ai/dop/turbo` | image2video | 6.5 |
| `higgsfield-ai/dop/standard` | image2video | 9.0 |
| `higgsfield-ai/dop/{lite,turbo,standard}/first-last-frame` | image2video | same as base |
| `soul-id` | character ref | 40.0 |

Note `dop-turbo` (the string the SDK README uses) is **not** a slug — the real value is `higgsfield-ai/dop/turbo`.

`GET /v1/models` returns 405; the correct path is `/models`.

### TRANSPORT (2026-07-26): Claude Code CLI + MCP, with an isolated MCP config

The REST API is abandoned (separate empty wallet). Buzz reaches Higgsfield by spawning the Claude Code CLI, which spends the **Plus subscription** credits (1615).

**The critical detail — MCP isolation.** A default `claude --print` health-checks every configured MCP server (Linear, Google Drive, Gmail, Calendar, Notion, claude-mem) plus hooks and plugins on *every* spawn. Two of those servers need re-auth and retry. Measured cost: 60s–5min per call, ~30% failure.

Restricting to a single MCP server fixes it:

```bash
claude --print --model haiku \
  --mcp-config higgsfield-mcp.json --strict-mcp-config \
  --allowedTools 'mcp__claude_ai_HiggsField__<tool>'
```

`higgsfield-mcp.json` (repo root):
```json
{"mcpServers":{"claude_ai_HiggsField":{"type":"http","url":"https://mcp.higgsfield.ai/mcp"}}}
```

**One-time setup:** the manually-declared server needs its own OAuth (the claude.ai-managed connector's token is not reused). Run `claude --mcp-config higgsfield-mcp.json --strict-mcp-config` interactively once, then `/mcp` → authenticate. The token caches to `~/.claude/.credentials.json` and every headless call afterwards reuses it.

**Measured after isolation:** 3/3 success at 22s / 30s / 54s. Before: 1/3 at 5–12 min.

#### Account state
A fully-formed Soul request returned `403 {"detail":"Not enough credits"}` — the endpoint and body were accepted, but the account has no credit balance. **Credits must be purchased before any generation succeeds.**

### Upload (input reference images)
```ts
client.uploadImage(buffer: Buffer, format?: 'jpeg'|'png'|'webp'): Promise<string>  // returns CDN URL
client.upload(data: Buffer|Uint8Array, contentType: string): Promise<string>
```
**These are documented on the v1 client only.** See spike **S2**.

### Error classes
`AuthenticationError`, `NotEnoughCreditsError`, `BadInputError`, `ValidationError`, `APIError`, `BrowserNotSupportedError` — all importable from `@higgsfield/client`.

---

## 4. Phase 0 — Spikes (resolve before/while building)

These are genuine unknowns. **Do not guess — verify and write findings back into this doc.**

| ID | Question | How to resolve |
|---|---|---|
| **S1** | ✅ **RESOLVED** — credentials work and authenticate. Account has **zero credits**, so generation returns `403 Not enough credits`. Top-up required. | — |
| **S3** | ✅ **RESOLVED** — see the model catalog in §3. `GET /models`. | — |
| **S4** | ✅ **RESOLVED** — credit costs in §3. Soul text2image 0–1.5 cr; DoP video 2–9 cr. | — |
| **S5** | ⚠️ **PARTIAL** — Soul takes `width_and_height` (e.g. `"1536x1536"`), **not** `aspect_ratio`. Surface→dimension mapping still to define. | — |
| **S6** | ✅ **RESOLVED** — DoP accepts no `duration` field. | — |
| **S2** | Can the **v2** client upload, or must we instantiate the **v1** client for `uploadImage`? | Inspect `node_modules/@higgsfield/client` types after install. If v2 lacks it, `client.ts` exports both and uses v1 solely for upload. |
| **S3** | Full model catalog + which image model is best for marketing graphics (flux vs soul vs recraft vs seedream) | `docs.higgsfield.ai`; make model id a **setting**, not a hardcode. |
| **S4** | Credit cost per image / per video second | Dashboard. Record in this doc; surface a cost note in Settings UI. |
| **S5** | Aspect-ratio support per endpoint, and mapping from Buzz's `targetSurface` (reel/post/story/ad) | Test calls. Map: post→`1:1`, story/reel→`9:16`, ad→`4:5`. |
| **S6** | Does image2video accept a duration param, and what is max duration? | Test call. Buzz's `config.duration` must map or be ignored explicitly. |

**Spike deliverable:** `scripts/test-higgsfield.ts` (run via `npx tsx`), matching the existing `scripts/test-*.ts` convention. It should: config the client, do one text-to-image, print the URL, download it, then one image2video off that frame. This is the manual test harness for the whole feature (the repo has **no test framework** — this is how Buzz tests things).

---

## 5. Implementation phases

### Phase 1 — Foundation: SDK, settings, client wrapper
**No credentials required to write; required only to run.**

1. `npm install @higgsfield/client`
2. **Settings plumbing** (`settings` is a flat KV table — **no schema change needed**):
   - `src/lib/settings.ts`: add
     - `getContentEngine(): Promise<string>` → setting `CONTENT_ENGINE` / env / default **`"buzz"`**
     - `getHiggsfieldImageModel()` → `HIGGSFIELD_IMAGE_MODEL` / default `"flux-pro/kontext/max/text-to-image"`
     - `getHiggsfieldVideoModel()` → `HIGGSFIELD_VIDEO_MODEL` / default `"/v1/image2video/dop"`
   - Credentials read via existing `getApiKey("HIGGSFIELD_CREDENTIALS")`. The settings API's mask regex `/(_API_KEY|SECRET|TOKEN|PASSWORD)$/i` does **not** match `_CREDENTIALS` — **add `_CREDENTIALS` to that regex** in `src/app/api/settings/route.ts` so the secret is masked on GET.
3. **`src/lib/higgsfield/client.ts`**:
   ```ts
   export async function getHiggsfieldClient(): Promise<HiggsfieldClient>   // throws if creds missing
   export async function hfGenerateImage(opts: { prompt: string; aspectRatio: string; seed?: number }): Promise<{ url: string; localPath: string }>
   export async function hfGenerateVideo(opts: { prompt: string; startImageUrl: string; duration?: number }): Promise<{ url: string; localPath: string; duration: number }>
   export async function hfUpload(buffer: Buffer, contentType: string): Promise<string>
   ```
   Each generate fn: `subscribe(..., withPolling: true)` → check `isCompleted` → extract `jobs[0].results.raw.url` → **download bytes** → write to `public/media/hf-<ts>.<ext>` → return `{ url: "/api/media/hf-<ts>.<ext>", localPath }`.
   Mirror the existing download+write pattern in `src/lib/providers/image.ts:40-47`.
4. **Error mapping** — extend `src/lib/providers/errors.ts`:
   - `AuthenticationError`, `NotEnoughCreditsError` → **terminal** (`isTerminalProviderError` true)
   - `BadInputError`, `ValidationError`, NSFW, failed → non-terminal
   - `classifyProviderError` returns friendly text for each.
5. `.env.example`: add `HIGGSFIELD_CREDENTIALS=`, `CONTENT_ENGINE=buzz`.
6. `scripts/test-higgsfield.ts` (the S-spike harness).

**Verify:** `npm run lint` clean, `npx tsc --noEmit` clean. `npx tsx scripts/test-higgsfield.ts` fails with a clear "credentials missing" message (not a crash) when unset.

---

### Phase 2 — Asset upload + cache
Higgsfield's servers **cannot fetch** `localhost/api/media/...`. Product assets must be pushed to HF's CDN.

1. **New table** in `drizzle/schema.ts`:
   ```ts
   export const higgsfieldAssets = sqliteTable("higgsfield_assets", {
     id: integer("id").primaryKey({ autoIncrement: true }),
     productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
     localPath: text("local_path").notNull(),   // "/api/media/logos/x.png" — cache key
     kind: text("kind"),                        // "logo" | "screenshot"
     hfUrl: text("hf_url").notNull(),           // CDN URL returned by upload
     createdAt: integer("created_at", { mode: "timestamp" }),
   });
   ```
   Export `HiggsfieldAsset` / `NewHiggsfieldAsset` types alongside the others.
   **Convention:** new columns nullable (see the `jobs.cancelRequested` comment) so SQLite does a plain ADD COLUMN.
   Apply with **`npm run db:push`** — NOT generate/migrate (journal is stale).
2. **`src/lib/higgsfield/assets.ts`**:
   ```ts
   export async function ensureProductAssetsUploaded(productId: number): Promise<{ logoUrl?: string; screenshotUrls: string[] }>
   ```
   - Read `products.logo` (string) and `products.screenshots` (JSON string array).
   - For each: look up `higgsfield_assets` by `(productId, localPath)`. Cache hit → reuse `hfUrl`. Miss → read bytes from disk, `hfUpload()`, insert row.
   - **Path resolution gotcha:** DB stores `/api/media/logos/x.png`. The real file is `public/media/logos/x.png`. Strip the `/api/media/` prefix and join to `process.cwd()/public/media/`. (Note: the existing `src/lib/images.ts` `prepareImages()` gets this wrong and silently swallows the failure — **do not copy that bug**.)
   - Cap screenshots at 4 (match `prepareImages` behaviour); skip missing files with a warning, never throw.

**Verify:** extend the spike script to upload a real product's logo and print the CDN URL; re-run and confirm the second run hits cache (no second upload).

---

### Phase 3 — Context assembler + prompt shaper

1. **`src/lib/higgsfield/context.ts`**:
   ```ts
   export interface HiggsfieldContext {
     name, description, planFile, profile, marketingStrategy,
     icp, jtbd, channelHints, llmInstructions,
     brainstormIdeas, instagramHandle,
     targetSurface, mediaType, config, targeting,
     logoUrl?, screenshotUrls
   }
   export async function gatherContext(input): Promise<HiggsfieldContext>
   ```
   Pull from `products` + `brainstorm_ideas` + `instagram_accounts` (join via `products.instagramAccountId`). Reuse `composeSkillSection()` from `src/lib/skills/` when `skillsEnabled()`.
2. **`src/lib/higgsfield/prompt.ts`**:
   ```ts
   export async function buildHiggsfieldPrompt(ctx, variationIndex): Promise<{ imagePrompt, motionPrompt, caption, hashtags }>
   ```
   - **One** `TextProvider` call via `resolveTextProvider(product.textProvider)`.
   - Ask for strict JSON; parse with `jsonrepair` (already a dependency) as the existing prompt parsers do.
   - Reuse `sanitizeCaption()` from `src/lib/generate.ts` on the caption.
   - `variationIndex` must vary the output — instruct a distinct angle per variation so `count > 1` doesn't return near-duplicates.
   - **Truncate** long inputs (`planFile` especially) before sending — this is the "distill, don't dump" rule.

   **This is translation, not creative direction.** Do not add judging, scoring, candidate comparison, or revise loops.

**Verify:** a spike-script mode that prints the assembled prompt for a real product without calling Higgsfield.

---

### Phase 4 — Image path

`src/lib/higgsfield/orchestrator.ts`, image branch:
```
for i in 0..count-1:
  if shouldCancel() -> break
  try:
    ctx    = gatherContext(...)                     # hoist outside the loop
    p      = buildHiggsfieldPrompt(ctx, i)
    img    = hfGenerateImage({ prompt: p.imagePrompt, aspectRatio: mapSurface(targetSurface) })
    posts.push({ content: p.caption, hashtags: p.hashtags, mediaUrl: img.url, config, metadata })
  catch e:
    errors.push({ index: i, message: classifyProviderError(e), terminal: isTerminalProviderError(e) })
    if terminal -> break
  await hooks.onPost?.(posts, errors)
```
`count` clamped 1..10 (match `generateImageContent`). `metadata` must satisfy `GenerationMetadata` — record engine `"higgsfield"` and the model id used.

**Verify:** run through the real UI — `npm run dev`, `/generate`, pick a product, engine=higgsfield, mediaType=image, count=2. Confirm two distinct images stream into the results panel, then save via the accept flow and confirm they render in the product's Content tab.

---

### Phase 5 — Video path ✅ IMPLEMENTED (Task 08)

**Default model: `higgsfield-ai/dop/turbo` (6.5 credits).** `marketing_studio_video` (60 credits) is too expensive for sustained use.

Video is a **two-step chain**: generate still first, then animate it.

```
Step 1: hfGenerateImage(imagePrompt, medias=[product_ref])  -> still (2 cr)
Step 2: hfUploadFile(still.localPath)                        -> media_id
Step 3: hfGenerateVideoFromMedia(motionPrompt, media_id)     -> video (6.5 cr)
```

Total: ~8.5 credits per video instead of 60. Roughly 170 videos on 1441 credits instead of 24.

**DoP model contract** (from spec §3):
- Type: image-to-video
- `medias[].role`: `start_image` (and `end_image` for first-last-frame variants)
- Supports: `aspect_ratio`, `duration`, `count`
- `marketing_studio_image` accepts exactly 1 reference media; DoP may differ (not yet verified via explore — MCP calls are slow)

**Cost preflight:** `hfGetCost("video", ...)` is called before every video generation and logged. The cost is visible, not silent.

**Phase 6 note:** Video must be user-triggered only, not scheduled. A cron job that quietly spends 6.5+ credits per run would drain the balance.

**Audio decision:** for v1, take whatever audio Higgsfield produces (or silence). Do **not** wire Buzz's TTS/Whisper caption pipeline in — that reintroduces the compositor.

- Populate `duration` on the `GeneratedPost` from `probeDuration()` (ffprobe). **Never fabricate it.**
- Same loop/cancel/error structure as Phase 4.

**Verify:** same UI path with mediaType=video. Confirm the mp4 plays in `ContentCard`'s `<video>` element.

---

### Phase 6 — Engine selection + UI

1. **Per-product override** — add nullable column to `products`:
   ```ts
   contentEngine: text("content_engine"),   // "buzz" | "higgsfield" | null
   ```
   `npm run db:push`.
2. **`resolveContentEngine(productId)`** in `src/lib/higgsfield/index.ts` or `settings.ts`: product column → global `CONTENT_ENGINE` setting → `"buzz"`.
   Follows the existing product-override-then-global pattern (and **fixes by example** the known bug that `products.videoProvider` is never read).
3. **Wire the branch** into `src/lib/generate.ts` as shown in §2.1.
4. **Settings UI** (`src/app/settings/page.tsx`): add a "Content Engine" select (`buzz` | `higgsfield`), a `HIGGSFIELD_CREDENTIALS` key input via the existing `saveApiKey()` helper, and model-id inputs. Match the surrounding component style exactly.
5. **Product edit UI** (`src/components/ProductForm.tsx`): optional engine override select. Keep it minimal.

**Verify:** toggle engine in Settings → generate → confirm the correct pipeline runs (log prefix `[higgsfield]`). Set engine back to `buzz` → confirm the original Remotion/spec pipeline is **completely unaffected**.

---

### Phase 7 — Hardening + docs

1. Log prefix `[higgsfield]` throughout (matches `[image]`, `[video]`, `[jobs]`).
2. Graceful degradation: credentials missing + engine=higgsfield → every variation fails with one clear terminal message ("Higgsfield credentials not configured"), not a stack trace.
3. Update `.env.example`, and add a short section to the project README / `PRODUCT.md` describing the two engines.
4. Record spike findings (S1–S6: model ids, costs, aspect ratios, duration limits) back into **this document**.

---

## 6. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Arabic / non-Latin text rendering.** Generative models mangle Arabic glyphs and RTL. Tanda's moat is Arabic-native done right. | **High** | Instruct HF prompts to produce **minimal or no text** in-image for Arabic products; keep copy in the caption. Document the limitation. If a product needs correct Arabic headlines, the **`buzz` engine remains the right choice** — this is exactly why the feature is switchable, not a replacement. |
| **R2** | Loss of brand precision — exact fonts, exact copy, deterministic layout. | Med | Accepted by design (explicit product decision). Feed brand colors/mood from `profile.visualIdentity` into the prompt to get as close as possible. |
| **R3** | **Long video jobs exceed `maxPollTime` (5 min default).** | Med | Raise `maxPollTime` for video. Buzz's job processing is already fire-and-forget and detached from the HTTP request (`/api/jobs/process` deliberately doesn't await), so long waits are safe server-side. Consider the SDK's **webhook** support later. |
| **R4** | Per-generation credit cost; a `count=10` batch is real money. | Med | Resolve S4; clamp count; surface cost in Settings. Terminal-error handling already stops a batch on `NotEnoughCreditsError`. |
| **R5** | `HF_*` env naming collides conceptually with HuggingFace. | Low | Use `HIGGSFIELD_CREDENTIALS`; never set bare `HF_API_KEY` in Buzz's env. |
| **R6** | Secret leaking via `GET /api/settings`. | Low | Add `_CREDENTIALS` to the mask regex (Phase 1). |
| **R7** | NSFW false-positives on legitimate product imagery. | Low | Map `isNsfw` to a clear non-terminal per-variation error; credits are refunded. |

---

## 7. Definition of Done

- [ ] `CONTENT_ENGINE=higgsfield` generates **images** end-to-end through the existing `/generate` UI, streaming and cancellable.
- [ ] `CONTENT_ENGINE=higgsfield` generates **videos** end-to-end; mp4 plays in `ContentCard`.
- [ ] Product logo + screenshots upload to HF once and are cached in `higgsfield_assets` (verified: second run does not re-upload).
- [ ] Prompts incorporate **all** available context: name, description, planFile, profile, marketingStrategy, icp, jtbd, channelHints, llmInstructions, brainstorm ideas, skill packs.
- [ ] `count > 1` produces genuinely distinct variations.
- [ ] Missing credentials → clean terminal error, no crash.
- [ ] `CONTENT_ENGINE=buzz` (default) behaviour is **byte-for-byte unchanged**; no existing file's behaviour regressed.
- [ ] Per-product engine override works and takes precedence over the global setting.
- [ ] `npm run lint` and `npx tsc --noEmit` both clean.
- [ ] `scripts/test-higgsfield.ts` exercises image + video + upload.
- [ ] Spike findings S1–S6 recorded in §4 of this doc.

---

## 8. Conventions (must follow)

- **TypeScript strict.** Path alias `@/*` → `./src/*`. `drizzle/` and `scripts/` are typechecked too.
- **Migrations: `npm run db:push`.** Never `db:generate`/`db:migrate` (journal is stale). New columns nullable.
- **No test framework.** Verification = `npm run lint` + `npx tsc --noEmit` + `npx tsx scripts/test-*.ts` + real UI run.
- **Errors:** orchestrators accumulate `GenerationFailure`, never throw per-variation. Routes return `classifyProviderError(e)`.
- **Zod** is only used in the Remotion spec files. API routes hand-validate — match the file you're touching.
- **Dynamic route params** are inconsistent (`Promise<{id}>` in newer routes, plain in older). Match the file you touch.
- **Media URLs** in the DB are always the `/api/media/...` form, never fs paths.
- **Surgical changes only.** This feature is additive. Do not refactor, "improve", or reformat the existing spec/Remotion pipeline. Do not delete the creative-director code — it is the default engine.

---

## 9. Sequencing

```
Phase 1 (foundation)  ──┬──> Phase 2 (assets) ──┐
                        └──> Phase 3 (context+prompt) ──┴──> Phase 4 (image) ──> Phase 5 (video) ──> Phase 6 (wiring+UI) ──> Phase 7 (hardening)
```
Phases 2 and 3 are independent of each other and can proceed in parallel after Phase 1.
Phases 4+ require live credentials (S1) to verify.
