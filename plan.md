# Plan: Configurable Image Providers + Settings-managed API Keys

**Status:** Plan only — no code changes yet.
**Date:** 2026-06-28

## Objective

Let the app generate images with any of three providers — **Pollinations**, **Google AI Studio (Gemini)**, or **HuggingFace** — chosen **per product** (mirroring the existing per-product `text_provider`). All API keys (text *and* image) move out of `.env` and into the DB-backed **Settings** UI, which becomes the single source of truth.

## Confirmed decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Default image provider | **Pollinations** stays the default — nothing changes until a product/global setting selects otherwise. |
| 2 | Gemini SDK | Use the **already-installed** `@google/generative-ai@0.24.1` (no new dependency). HuggingFace shows a **model dropdown** (researched options below). |
| 3 | Scope | **Per-product** image provider, mirroring `products.text_provider`. Global default lives in Settings as the fallback. |
| 4 | API keys | **No API keys in `.env`.** Both text and image provider keys are entered in Settings and read from the DB. |
| 5 | Secret handling | `GET /api/settings` masks secret values; key inputs are write-only. |

---

## Research findings

### Google Gemini image generation with the installed SDK

- `@google/generative-ai@0.24.1` is **officially deprecated/legacy** (its `README.md` line 1: "[Deprecated] Google AI JavaScript SDK"; recommends migrating to `@google/genai`). Its TypeScript types **do not** include `responseModalities`.
- **However**, the SDK is a thin pass-through: `dist/index.js` builds the request with `Object.assign({ generationConfig: this.generationConfig, ... }, formattedParams)` (lines ~1377/1393) — it does **not** whitelist `generationConfig` fields. So a `generationConfig: { responseModalities: ["Image"] }` passed via a TS cast is forwarded verbatim to the `v1beta` endpoint.
- Reading image output is supported: the response part type `GenerativeContentBlob` / `inlineData` exists in the type defs. Image bytes arrive as `response.candidates[0].content.parts[].inlineData = { mimeType, data (base64) }`.
- **Model:** `gemini-2.5-flash-image` ("Nano Banana"). Aspect ratio is hinted via prompt (the `imageConfig.aspectRatio` knob is a `@google/genai`-only convenience).
- **Caveat / risk:** because we rely on undocumented pass-through of a deprecated SDK, a runtime smoke test is mandatory (see Phase 7). Pricing for reference: ~$0.039/image (1290 output tokens @ $30/1M).

### Best HuggingFace text-to-image models to offer (mid-2026)

| Model id | Why offer it |
|----------|--------------|
| `black-forest-labs/FLUX.1-schnell` | Fast, Apache-2.0, most free-tier-friendly — **default** |
| `black-forest-labs/FLUX.1-dev` | Higher quality than schnell |
| `Qwen/Qwen-Image` | Current quality leader (Feb 2026 "Qwen-Image-2.0"); best complex-text rendering, native 2K |
| `stabilityai/stable-diffusion-3.5-large` | Strong general-purpose alternative |

- **Endpoint risk:** HF's serverless image surface is in flux (classic `api-inference.huggingface.co` vs. the newer Inference Providers router). Plan: default to `POST https://api-inference.huggingface.co/models/{model}` returning raw image bytes; if a chosen model is only on Inference Providers, fall back to the router. **Confirm the working endpoint per model during implementation** (Phase 2).

**Sources:**
- [Gemini API — Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Introducing Gemini 2.5 Flash Image (Nano Banana)](https://developers.googleblog.com/introducing-gemini-2-5-flash-image/)
- [`@google/generative-ai` deprecation / migration](https://ai.google.dev/gemini-api/docs/migrate)
- [HuggingFace — Text-to-Image task](https://huggingface.co/docs/inference-providers/tasks/text-to-image)
- [Qwen-Image (HF)](https://huggingface.co/Qwen/Qwen-Image)
- [Text-to-Image model king: Qwen Image vs FLUX](https://huggingface.co/blog/MonsterMMORPG/new-text-to-image-model-king-is-qwen-image-flux-de)

---

## Architecture

### Data model

- **No new settings table** — reuse `settings(key unique, value)` (`drizzle/schema.ts:104`). New keys are just rows (no migration):
  - `IMAGE_PROVIDER` — global default: `pollinations` \| `gemini` \| `huggingface` (default `pollinations`)
  - `IMAGE_MODEL_HUGGINGFACE` — selected HF model (default `black-forest-labs/FLUX.1-schnell`)
  - `GOOGLE_AI_API_KEY`, `HUGGINGFACE_API_KEY`, `POLLINATIONS_API_KEY` — secret (shared: the Google/HF keys power **both** text and image)
- **New per-product column** (`drizzle/schema.ts`, after line 17 `text_provider`): `imageProvider: text("image_provider")` — nullable; `null` = use global default. **Requires `npm run db:push`** (per project memory: use `db:push`, not generate/migrate — journal is stale).

### Resolution logic (the core contract)

```
resolveImageProvider(productImageProvider?):
  name = productImageProvider || getSetting("IMAGE_PROVIDER") || env.IMAGE_PROVIDER || "pollinations"
  key  = getApiKey(KEY_FOR[name])            // settings-first, env fallback
  switch name:
    pollinations -> createPollinationsImageProvider({ apiKey: key })
    gemini       -> createGeminiImageProvider({ apiKey: key })
    huggingface  -> createHuggingFaceImageProvider({ apiKey: key, model: getImageModel() })

getApiKey(name)   = (await getSetting(name)) || process.env[name] || ""
getImageModel()   = (await getSetting("IMAGE_MODEL_HUGGINGFACE")) || "black-forest-labs/FLUX.1-schnell"
```

**Hard invariant (do not break):** every image provider must save the file under `public/media/` and return `localPath` (a `/api/media/...` path). The video orchestrator depends on it — `orchestrator.ts:250` does `urlPathToFs(imgResult.localPath)` for ffmpeg. The current Pollinations provider already does this.

### Why env stays a *silent* fallback

`getApiKey` reads Settings first, then `process.env`. This keeps existing deployments working through the migration. `.env.example` will **stop listing the keys as required** (documented as "set via Settings UI"). This honors "nothing in `.env` for keys" while avoiding a hard breakage if a key isn't yet entered. (If you want a *hard* removal with no env fallback, say so — it's a one-line change but means generation throws until keys are entered in Settings.)

---

## Implementation phases

### Phase 1 — Settings helpers (`src/lib/settings.ts`)
Add, mirroring the existing `getTextProvider()`:
- `getImageProviderName(): Promise<string>` → `getSetting("IMAGE_PROVIDER") || process.env.IMAGE_PROVIDER || "pollinations"`
- `getApiKey(name: string): Promise<string>` → `getSetting(name) || process.env[name] || ""`
- `getImageModel(): Promise<string>` → `getSetting("IMAGE_MODEL_HUGGINGFACE") || "black-forest-labs/FLUX.1-schnell"`
- **Verify:** returns DB value when a row exists, env when not, default otherwise.

### Phase 2 — Image providers (`src/lib/providers/`)
- **Edit `image.ts`** — `createPollinationsImageProvider(config: ProviderConfig = {})`: take key from `config.apiKey ?? process.env.POLLINATIONS_API_KEY` (line 15). No other behavior change.
- **New `image-gemini.ts`** — `createGeminiImageProvider({ apiKey })`:
  - `new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash-image" })`
  - `generateContent({ contents:[{ role:"user", parts:[{ text: prompt }] }], generationConfig: ({ responseModalities:["Image"] } as unknown as GenerationConfig) })`
  - Find the part with `inlineData`, `Buffer.from(data, "base64")`, save to `public/media/gemini-<ts>.png`, return `{ url: localPath, localPath: "/api/media/<file>" }`.
  - Aspect ratio: append a hint to the prompt from `input.width/height`.
- **New `image-hf.ts`** — `createHuggingFaceImageProvider({ apiKey, model })`:
  - `POST https://api-inference.huggingface.co/models/{model}` with `{ inputs: prompt }`, `Authorization: Bearer <key>`; response is raw image bytes → save → return `localPath`. (Confirm endpoint per model; fall back to Inference Providers router if needed.)
- **Export** all three from `index.ts`.
- **Verify:** each writes a real file to `public/media/` and returns a valid `/api/media/...` path.

### Phase 3 — Factory / resolvers (`src/lib/providers/factory.ts`)
- `createTextProvider(providerName?, config?: { apiKey?: string })` — forward `config` into `createGeminiTextProvider`/`createHuggingFaceTextProvider` (both already accept `config.apiKey`). Antigravity ignores it.
- `resolveTextProvider(productTextProvider?: string | null): Promise<TextProvider>` — resolve name (`productTextProvider || getTextProvider()`), pick the key by family (`gemini*` → `GOOGLE_AI_API_KEY`; `huggingface` → `HUGGINGFACE_API_KEY`; `antigravity` → none), call `createTextProvider(name, { apiKey })`.
- `resolveImageProvider(productImageProvider?: string | null): Promise<ImageProvider>` — per the contract above.
- **Verify:** typechecks; resolvers return a provider whose `name` reflects the chosen family.

### Phase 4 — Migrate all construction sites (satisfies #4)
Replace direct env-keyed construction with the resolvers:

| File:line | Change |
|-----------|--------|
| `generate.ts:79` | `createTextProvider(...)` → `await resolveTextProvider(product.textProvider)` |
| `generate.ts:119` | `createPollinationsImageProvider()` → `await resolveImageProvider(product.imageProvider)` |
| `video/orchestrator.ts:138` | → `await resolveTextProvider(product.textProvider)` |
| `video/orchestrator.ts:198` | → `await resolveImageProvider(product.imageProvider)` |
| `api/products/[id]/brainstorm/route.ts:87` | → `await resolveTextProvider(product.textProvider)` |
| `brain/extract.ts:38` | `createTextProvider(textProvider)` → `await resolveTextProvider(textProvider)` |

- **Verify:** `grep -rn "process.env.\(GOOGLE_AI\|HUGGINGFACE\|POLLINATIONS\)_API_KEY" src` returns only the in-provider `getApiKey` fallbacks; no caller reads keys directly.

### Phase 5 — Per-product UI (`src/components/ProductForm.tsx`)
Mirror the `textProvider` pattern exactly:
- State: `const [imageProvider, setImageProvider] = useState(product?.imageProvider || "")` (`""` = use default).
- Dropdown (next to the Text Provider block at lines 281–317): `Use default` / `Pollinations` / `Google AI Studio (Gemini)` / `HuggingFace`.
- Include in submit payload alongside `textProvider` (line ~157): `imageProvider: imageProvider || null`.
- **API routes** — mirror `textProvider`:
  - `api/products/route.ts:62` (POST) → add `imageProvider: body.imageProvider || null`
  - `api/products/[id]/route.ts:110,131` (PUT) → add `imageProvider: body.imageProvider || null`
- **Verify:** set a product's image provider, save, reload → persists; generation uses it.

### Phase 6 — Settings UI (`src/app/settings/page.tsx`)
- **New "API Keys" card** — three write-only password inputs: Google AI, HuggingFace, Pollinations. Each saves via existing `PUT /api/settings { key, value }` on blur/Save. Show "•••• set" when a value already exists (from masked GET).
- **New "Default Image Provider" card** — dropdown (`pollinations`/`gemini`/`huggingface`) → `PUT IMAGE_PROVIDER`. When `huggingface` is selected, reveal a **model dropdown** (the four researched options) → `PUT IMAGE_MODEL_HUGGINGFACE`. (Mirrors the antigravity model sub-dropdown.)
- **Verify:** selections persist across reload; entering a key then generating uses it.

### Phase 7 — Secret hardening (`src/app/api/settings/route.ts`)
- In `GET`, mask values whose key matches `/(_API_KEY|SECRET|TOKEN|PASSWORD)$/i`: return a marker (`"••••" + last4`) or `{ __set: true }` instead of the raw value. Non-secret keys (`IMAGE_PROVIDER`, `IMAGE_MODEL_HUGGINGFACE`, `TEXT_PROVIDER`) return normally.
- UI treats key fields as write-only: only `PUT` when the user types a new value (empty input = leave unchanged).
- **Verify:** `GET /api/settings` response contains no full key strings.

### Phase 8 — `.env` cleanup
- Remove `GOOGLE_AI_API_KEY`, `HUGGINGFACE_API_KEY`, `POLLINATIONS_API_KEY` from `.env.example` (and clear in `.env`); add a comment: "AI provider API keys are managed in Settings → API Keys." Non-key config (`ANTIGRAVITY_BIN`, `ADMIN_PASSWORD`, `FACEBOOK_*`, `INSTAGRAM_*`, `DATABASE_PATH`, `TEXT_PROVIDER`) stays.

---

## Verification (end-to-end)

1. `npm run db:push` succeeds; `products.image_provider` column exists.
2. `npm run lint` and `npm run build` clean (keep the zero-ESLint-warning state).
3. In Settings: enter each key; pick global image provider; pick HF model.
4. Generate an **image post** with a product set to each provider → image renders, file lands in `public/media/`, post shows it.
5. Generate a **video** (orchestrator path) with a non-Pollinations product → scenes render via the chosen provider (confirms the `localPath` invariant).
6. Per-product override beats the global default; `""`/null falls back to the default.
7. `GET /api/settings` shows masked keys only.

---

## Risks & mitigations

- **Deprecated Gemini SDK image path** — undocumented pass-through. *Mitigation:* Phase 7 smoke test; if it fails at runtime, the fallback is a raw `fetch` to `…/models/gemini-2.5-flash-image:generateContent` (same request body), or adding `@google/genai`. Flag back before switching approaches.
- **HF serverless endpoint drift** — *Mitigation:* verify endpoint per model in Phase 2; keep the model list small and tested.
- **Free-tier limits / quota errors** — providers may 429. *Mitigation:* surface provider errors to the UI rather than failing silently (current code throws on `!response.ok`).
- **Key migration gap** — a deploy with empty Settings keys and blanked `.env` will fail generation until keys are entered. *Mitigation:* the silent env fallback in `getApiKey` (see above); document the one-time Settings entry step.

## Out of scope (intentionally)

- Per-product **model** override (model stays a global Settings choice; provider is per-product).
- Imagen / other Gemini image models (different `:predict` API).
- Migrating non-key config out of `.env`.
- Local GPU generation (no NVIDIA GPU on this host).
