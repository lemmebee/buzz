# Buzz Simplification Plan

**Status:** Decisions locked — implementing
**Written:** 2026-07-27

Buzz currently carries two complete generation engines, three rendering
pipelines, a video stack, and an image-style axis. One path is used. This plan
strips it to a single route from product to post.

---

## 1. Target: one path

```
Create product
   └─ upload brief + screenshots + logo
        └─ analyse  → profile + marketing strategy      (text provider, vision)
             └─ brainstorm ideas                        (text provider)
                  └─ generate image post                (text provider → image provider)
                       └─ review, approve, schedule, publish to Instagram
```

**Providers, and nothing else:**

| Role | Allowed |
|---|---|
| Text | Claude Code · Antigravity (agy) · Gemini API · HuggingFace |
| Image | Pollinations · Google AI Studio (Gemini) · HuggingFace · Higgsfield |
| Video | Higgsfield only |

**Removed axes:** video, image styles, content engines, video styles, render
engines, best-of-N judging.

Every generation becomes: **one text call, one image call.**

---

## 2. Decisions (locked 2026-07-27)

| # | Decision | Outcome |
|---|---|---|
| **D1** | **Higgsfield stays.** Not deleted. | `src/lib/higgsfield/` and the engine switch remain. Buzz keeps two image engines: `buzz` (prompt → image provider) and `higgsfield` (generative via MCP). |
| **D2** | **Remove Remotion, video, and the image spec pipeline.** | Deleted in full. |
| **D2-compositor** | **No compositor.** Not even a sharp-based one. | An image is whatever the provider returns from a text prompt. |
| **D4** | **Kill best-of-N.** | `vision-judge` deleted, `GENERATION_CANDIDATES` removed. One image per variation, no quality gate. |

### Consequences accepted

- **Generated images will not contain the real product UI** on the `buzz`
  engine. Pollinations, FLUX and Gemini render an invented interface from a
  text description. The only path that shows the real app is the Higgsfield
  engine with a screenshot as reference — which is now the reason it is kept.
- **Arabic/RTL text in images is no longer reliable anywhere.** The
  deterministic renderer was what made it correct. Arabic copy belongs in the
  caption, not in the image.
- **No automatic quality gate.** Whatever the model returns is the post.

### Correction (same day)

The first pass read "no video engines" as no video anywhere and removed
Higgsfield's video path too. That was wrong: **Higgsfield video is kept.**

"No video engines" means no *rendering* engines — Remotion and ffmpeg. Video
now exists on exactly one path: Higgsfield image-to-video, ~2-4 credits a clip,
user-triggered only. No Remotion, no ffmpeg, no TTS, no burned captions, no
video style axis.

Duration comes back from what was requested rather than an ffmpeg probe: it is
snapped to the model's allowed values before sending, so there is nothing to
measure and no reason to keep ffmpeg for it.

## 3. What is removed

| Area | Path | Lines |
|---|---|---|
| Remotion compositions | `src/remotion/` | 2 452 |
| Video pipeline | `src/lib/video/` | 1 656 |
| Image spec pipeline | `render-spec` · `spec-author` · `select` | 707 |
| Best-of-N judging | `vision-judge.ts` | 207 |
| Dead prompt builders | 8 unused in `brain/prompts.ts` | 247 |
| Dead provider registry | `providers/registry.ts` | 78 |

**≈ 5 350 lines.**

**Dependencies dropped:** `remotion`, `@remotion/*` (6), `ffmpeg-static`,
`fluent-ffmpeg`, `@types/fluent-ffmpeg`, `msedge-tts`, `@xenova/transformers`.

**Kept:** `@higgsfield/client` (D1), `sharp` (screenshot preparation for
vision, SVG rasterisation), `better-sqlite3`, `drizzle`, `jsonrepair`,
`react-markdown`.

**Settings removed:** `VIDEO_PROVIDER`, `IMAGE_STYLE`, `GENERATION_CANDIDATES`,
`HIGGSFIELD_VIDEO_MODEL`.
**Settings kept:** `CONTENT_ENGINE` (buzz | higgsfield), text provider,
image provider, `HIGGSFIELD_IMAGE_MODEL`, API keys, binary paths, extraction
and image-preparation limits.

---

## 4. What survives

- Products, briefs, screenshots, logo
- **Extraction** — `buildProfileAndStrategyPrompt`, vision over screenshots.
  Untouched; the highest-value part of the app, and it now works.
- **Brainstorm** — `buildBrainstormPrompt`
- **Content authoring** — `buildContentGenerationPrompt` → caption, hashtags,
  image prompt
- **Image generation, two engines:**
  - `buzz` — `buildFluxPrompt` → Pollinations / Gemini / HuggingFace
  - `higgsfield` — `buildHiggsfieldPrompt` → MCP, screenshot as reference
- Content queue, approve/schedule, Instagram publishing
- Traces, settings, product management

---

## 5. Phases

Each phase leaves the app working. Verify with
`./node_modules/.bin/tsc --noEmit`, `npm run lint`, and a real generation
before starting the next. Deploy only via `bash scripts/deploy-prod.sh`.

**Phase 0 — Free deletions.** The 8 dead prompt builders and
`providers/registry.ts`. Nothing imports them. 325 lines, no behaviour change.

**Phase 1 — Image only.** `generateContent()` drops its video branch and
keeps the engine branch. `mediaType` fixes to `image`. `/api/generate` rejects
video with a clear message instead of failing at render time.

**Phase 2 — Remove video.** Delete `src/lib/video/`, the video provider
factory, TTS, captions, ffmpeg. Strip video from the generate UI, presets and
schedules. Higgsfield's video path goes with it. `ContentCard` keeps its video
branch so the 20 archived rows still play (D3).

**Phase 3 — Remove Remotion and the spec pipeline.** Delete `src/remotion/`,
`render-spec`, `spec-author`, `select`, `vision-judge`. The `buzz` engine
becomes `buildFluxPrompt` → image provider, one call. No compositor. Drop the
Remotion, ffmpeg, TTS and Whisper dependencies.

**Phase 4 — Simplify settings and UI.** Remove image style, video provider and
candidates. Settings: Text Provider · Image Provider · Content Engine · API
Keys · Pipeline · Advanced · Publishing · Diagnostics. Generate page loses
media-type and video-style controls.

**Phase 5 — Schema and data.** Drop `products.video_provider` and
`higgsfield_video_model`. Keep `content.media_type` for archived rows, keep the
Higgsfield tables. `npm run db:push` after backing up both DBs.

**Phase 6 — Docs.** Rewrite the Content Engines section of `PRODUCT.md`,
`README.md` and `.env.example`. Move `plans/higgsfield-*` to `docs/history/`.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **`buzz`-engine images will show an invented product UI** — no compositor, no screenshot compositing | Accepted (D2). Higgsfield is the path when the real app must appear |
| **Arabic/RTL in images is no longer reliable on any engine** | Keep Arabic in the caption; the deterministic renderer that handled it is gone |
| **No quality gate** — first result ships | Accepted (D4). Regenerate manually if poor |
| 20 archived video rows become unplayable if media is pruned | `public/media` untouched; `ContentCard` keeps its video branch |
| `sharp` removed by association with the image pipeline | Explicitly retained — extraction depends on it |
| Higgsfield deleted by association with "remove engines" | Explicitly retained (D1) |

---

## 7. Sequencing

All decisions are locked; phases run in order 0 → 6. Each is committed
separately so any single phase can be reverted without unpicking the rest.
