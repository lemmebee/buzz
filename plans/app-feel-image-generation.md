# Plan: App-Feel Image Generation

## Goal
Generate marketing images for apps using user-uploaded marketing briefs + screenshots as creative assets. Text provider (vision-capable) sees everything and makes creative decisions about both captions and image direction in a single call.

## Data Flow
1. User uploads **marketing brief** + **screenshots** for a product
2. On app creation: send everything to text provider → extracts **app profile** (JSON) + **marketing strategy**. Stored in DB. Reanalyzed when source files change.
3. On content generation: app profile + marketing strategy + screenshots → text provider → **caption** + **image generation instructions**
4. Screenshots are **versatile assets** — flexible or rigid — decided by text provider
5. Image instructions + screenshots → **Pollinations** → final image

## Key Decisions
- **Single call**: text provider handles both caption + image direction together
- **Vision model**: swap GLM-4.7-Flash → GLM-4.5V
- **Structured profile**: extract on upload, cache in DB, reuse across generations
- **No compositing**: text provider decides how screenshots inform the image prompt, Pollinations generates final image
- **Image input format**: base64 via OpenAI-compatible `image_url` content part
- **Max screenshots**: no limit enforced

---

## Chunk 1: Vision-capable text provider

**Goal**: Text provider accepts images + swap to vision model.

### Changes
- `src/lib/providers/types.ts` — add `images?: string[]` to `TextGenerationInput`, add `imagePrompt?: string` to `TextGenerationOutput`
- `src/lib/providers/text.ts` — support image inputs (base64 `image_url` content parts), switch default model to `zai-org/GLM-4.5V`

### Verify
- Call text provider with an image path → get valid response
- Existing text-only calls still work

---

## Chunk 2: DB schema — screenshots + app profile + marketing strategy

**Goal**: Products store screenshots, extracted app profile, and marketing strategy.

### Changes
- `drizzle/schema.ts` — add `screenshots` (JSON array of paths), `appProfile` (JSON), `marketingStrategy` (JSON) columns
- Run migration

### Verify
- Migration succeeds, columns exist

---

## Chunk 3: Screenshot upload API

**Goal**: Upload screenshots for a product, store on disk + paths in DB.

### Changes
- `src/app/api/products/route.ts` + `[id]/route.ts` — handle file uploads, save to `/public/media/screenshots/`, store paths in DB

### Verify
- POST/PUT with screenshots → files on disk, paths in DB

---

## Chunk 4: Screenshot upload UI

**Goal**: Frontend for uploading/removing screenshots per product.

### Changes
- `src/components/ProductForm.tsx` — multi-file upload, preview, remove

### Verify
- Upload screenshots via UI → visible in form, persisted via API

---

## Chunk 5: App profile + marketing strategy extraction

**Goal**: On brief/screenshot upload, extract structured app profile + strategy via text provider.

### Changes
- `src/lib/brain/prompts.ts` — new `buildProfileAndStrategyPrompt(planFileContent, screenshotDescriptions)`
- `src/app/api/products/route.ts` + `[id]/route.ts` — on brief/screenshots change, call extraction, store results in DB

### Verify
- Upload product with brief + screenshots → appProfile + marketingStrategy populated in DB

---

## Chunk 6: Unified content generation prompt

**Goal**: Single text provider call produces caption + image instructions.

### Changes
- `src/lib/brain/prompts.ts` — new `buildContentGenerationPrompt(appProfile, marketingStrategy, screenshots, platform, contentType)`
- Returns caption + hashtags + image generation instructions (scene, screenshot usage, mood, style)

### Verify
- Call with test data → coherent caption + image prompt output

---

## Chunk 7: Wire into generation flow

**Goal**: End-to-end: generate post using profile + strategy → caption + image.

### Changes
- `src/app/api/generate/route.ts` — load appProfile + marketingStrategy + screenshots from DB, call content generation prompt, send image instructions to Pollinations, store post

### Verify
- Generate post for product with profile → caption matches brand voice, image prompt references screenshots, Pollinations returns image
