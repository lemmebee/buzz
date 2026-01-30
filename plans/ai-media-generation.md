# AI Media Generation Integration Plan

## Overview
Add image, video, and audio generation to Buzz. Buzz is a **marketing expert** that delegates all generation (text + media) to AI providers. User uploads product plan file → Buzz builds expert marketing prompts → AI generates everything.

---

## Architecture

### Core Concept
```
Product Plan File (markdown)
         ↓
    [Buzz Marketing Mind]
    - Parses product info
    - Builds expert marketing prompts
    - Encodes platform rules, content formulas
         ↓
    [AI Providers] (pluggable)
    - Text: captions, hashtags, scripts
    - Image: product visuals, lifestyle shots
    - Video: reels, stories
    - Audio: voiceovers, music
         ↓
    Generated content ready for preview
```

### Marketing Mind (Prompt Engineering)
```
src/lib/brain/
├── types.ts           # Interfaces
├── prompts.ts         # Marketing-expert system prompts
└── parser.ts          # Product plan file parser
```

Buzz's marketing expertise = carefully crafted prompts that tell AI:
- How to analyze the product and extract selling points
- Platform best practices (Instagram reels need hooks in 3s, etc.)
- Content formulas (reel=hook→value→CTA, post=story→insight→engage)
- Tone and audience adaptation rules
- Visual style guidelines for media generation

### Provider Abstraction Layer
```
src/lib/providers/
├── types.ts           # Common interfaces
├── registry.ts        # Provider registration & config
├── text.ts            # TextProvider interface
├── image.ts           # ImageProvider interface
├── video.ts           # VideoProvider interface
└── audio.ts           # AudioProvider interface
```

All providers pluggable. No specific provider chosen yet.

### Core Interfaces
```typescript
// brain/types.ts
interface ProductPlan {
  name: string;
  description: string;
  features: string[];
  audience: string;
  tone: string;
  themes: string[];
  visualStyle?: string;
}

interface GenerationInput {
  product: ProductPlan;
  platform: 'instagram' | 'twitter';
  purpose: ContentPurpose;
  mediaType: MediaType;
}

interface GenerationOutput {
  media: {
    url: string;
    localPath?: string;
    type: MediaType;
  };
  text: {
    caption: string;
    hashtags: string[];
    description?: string;
    script?: string;
  };
}

type ContentPurpose = 'reel' | 'post' | 'story' | 'carousel' | 'ad';
type MediaType = 'image' | 'video' | 'audio';

// providers/types.ts
interface Provider<TInput, TOutput> {
  name: string;
  generate(input: TInput): Promise<TOutput>;
}
```

---

## Implementation Chunks

### Chunk 1: Brain Foundation 🟢
**Goal:** Core types and product plan parser

Files:
- `src/lib/brain/types.ts` - interfaces
- `src/lib/brain/parser.ts` - markdown plan file parser

### Chunk 2: Marketing Prompts 🟢
**Goal:** Expert prompts that make Buzz a good marketer

Files:
- `src/lib/brain/prompts.ts` - system prompts for AI

Contains prompt templates for:
- Analyzing product → extracting hooks, benefits, differentiators
- Platform-specific content rules
- Caption generation by purpose (reel/post/story/carousel)
- Hashtag strategy
- Media description for image/video AI
- Script writing for video/audio

### Chunk 3: Provider Abstraction (partial)
**Goal:** Pluggable provider interfaces

Files:
- 🟢 `src/lib/providers/types.ts` - base interfaces
- 🟢 `src/lib/providers/registry.ts` - provider registration
- 🟢 `src/lib/providers/text.ts` - TextProvider (HuggingFace GLM-4.7-Flash)
- 🟢 `src/lib/providers/index.ts` - exports
- 🟢 `src/lib/providers/image.ts` - ImageProvider (Pollinations.ai flux)
- ⏳ `src/lib/providers/video.ts` - VideoProvider
- ⏳ `src/lib/providers/audio.ts` - AudioProvider

### Chunk 4: Media Storage
**Goal:** Store generated media locally

Files:
- `src/lib/storage.ts` - download from URL, save to `public/media/`

DB changes:
- Add `mediaFiles` table

### Chunk 5: Generation Service
**Goal:** Orchestrates brain + providers

Files:
- `src/lib/generation.ts` - main generation orchestrator

Flow:
1. Takes GenerationInput
2. Uses brain/prompts to build AI prompts
3. Calls appropriate providers (text + media)
4. Stores media locally
5. Returns GenerationOutput

### Chunk 6: API Routes
**Goal:** HTTP endpoints

Routes:
- `POST /api/generate/content` - full generation
- `POST /api/products/import` - upload plan file

### Chunk 7: Generation UI
**Goal:** UI for content generation

Page: `/generate` (update existing)

Flow:
1. Select product (or upload plan file)
2. Select platform + purpose + media type
3. Generate → preview media + text
4. Edit text if needed
5. Save to queue or regenerate

### Chunk 8: Preview & Queue
**Goal:** Preview and manage generated content

Updates:
- Media preview in content pages
- Editable text fields
- Regenerate buttons

Posts table additions:
- `audioUrl`, `script`, `description`, `platform` columns

---

## DB Schema Changes

```sql
CREATE TABLE mediaFiles (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  provider TEXT,
  metadata TEXT,
  createdAt INTEGER DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE posts ADD COLUMN audioUrl TEXT;
ALTER TABLE posts ADD COLUMN script TEXT;
ALTER TABLE posts ADD COLUMN description TEXT;
ALTER TABLE posts ADD COLUMN platform TEXT DEFAULT 'instagram';
```

---

## Dependency Order

```
Chunk 1 (types + parser)
    ↓
Chunk 2 (prompts)
    ↓
Chunk 3 (providers) ←── can parallel with 2
    ↓
Chunk 4 (storage)
    ↓
Chunk 5 (generation service)
    ↓
Chunk 6 (API routes)
    ↓
Chunk 7 (UI)
    ↓
Chunk 8 (preview/queue)
```

---

## Completed

- **Product plan file upload:** Products can now have markdown plan files attached
  - Schema: `planFile` (content) + `planFileName` (original name) columns
  - ProductForm: file upload with .md/.txt/.markdown support
  - ProductCard: "has plan" badge + modal viewer for plan content
  - API routes updated for create/update

- **Text provider (Chunk 3 partial):** HuggingFace GLM-4.7-Flash integration
  - Provider abstraction layer: `src/lib/providers/`
  - Types for all provider types (text, image, video, audio)
  - Registry for registering/getting providers
  - HuggingFace text provider using GLM-4.7-Flash free API
  - OpenAI-compatible chat completions endpoint
  - Env var: `HUGGINGFACE_API_KEY` (optional for free tier)

## Decisions Made

- **Plan file format:** Markdown
- **Media storage:** `public/media/`
- **Audio:** Standalone option available
- **Text generation:** Delegated to AI (not templates)
- **Providers:** Abstract interfaces now, implementations later
- **Image generation:** Pollinations.ai (free, no API key, flux model)

## Verification

After each chunk:
1. `npm run dev` starts without errors
2. Test relevant functionality

Full integration test:
1. Upload product plan file → product created
2. Generate content → media + text returned
3. Preview in UI
4. Save to queue → appears in content list
