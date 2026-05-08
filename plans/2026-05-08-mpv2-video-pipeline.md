# Adopting MoneyPrinterV2 ideas into Buzz

## Context

User asked utility of FujiwaraChoki/MoneyPrinterV2 to Buzz. MPV2 (Python, AGPL-3.0) automates Twitter bot, YouTube Shorts video, affiliate marketing, business scraping/cold email.

Buzz today = Next.js/TS app generating AI brand-consistent Instagram captions + static images via Pollinations, with Discord approval and Meta Graph API publish. `ContentPurpose: "reel"` exists but no-ops to image. `VideoProvider`/`AudioProvider` declared in `src/lib/providers/types.ts:43-70` but never registered. `buildScriptPrompt`/`buildVideoPrompt`/`buildAudioPrompt` already written in `src/lib/brain/prompts.ts:588-718` but never called.

Selected MPV2 idea: **video content generation pipeline**. Multi-platform publishing (Post Bridge) skipped per user - keep IG-only.

License caveat: MPV2 = AGPL-3.0. Borrow architecture; reimplement in TypeScript.

## Generation flow (corrected)

User-driven 3-step picker, both axes selected up front, no auto-derivation:

1. **Pick mediaType** - `image` or `video`
2. **Pick targetSurface** - `reel | post | story | ad`
3. **Config tweaks** - per-(targetSurface, mediaType) defaults pre-filled, user can override

Both selections are independent. Video can be posted as Reel, Feed Post, or Story. Image can be Feed Post or Story. Ad is video or image (later via Marketing API).

### Defaults per (targetSurface, mediaType)

Stored as const map in new `src/lib/content/defaults.ts`:

| targetSurface | mediaType | Defaults |
|---------------|-----------|----------|
| reel | video | `{ durationSec: 15, aspectRatio: "9:16", captions: true }` |
| reel | image | (invalid - reels require video; UI hides this combo) |
| post | image | `{ aspectRatio: "1:1" }` |
| post | video | `{ durationSec: 30, aspectRatio: "1:1", captions: false }` |
| story | image | `{ aspectRatio: "9:16" }` |
| story | video | `{ durationSec: 15, aspectRatio: "9:16", captions: false }` |
| ad | image | `{ aspectRatio: "1:1" }` (Marketing API deferred to later phase) |
| ad | video | `{ durationSec: 15, aspectRatio: "1:1", captions: true }` (deferred) |

User overrides via UI form override any default. Schedule-driven generation pulls overrides from `generationSchedules.config` JSON.

## Approach

Local Node-native pipeline. No SaaS deps. All free OSS:

| Stage | Tool | Notes |
|-------|------|-------|
| Script | existing `buildScriptPrompt()` at `src/lib/brain/prompts.ts:617` | Wired into Gemini/HF text provider. |
| Scene stills | existing `createPollinationsImageProvider()` at `src/lib/providers/image.ts:7-50` | Aspect from config defaults. 1-N stills, LLM-decided count. |
| Narration | `msedge-tts` (npm) | Free, no key, ~70 voices. mp3 out. |
| Captions (optional) | `@xenova/transformers` Whisper-tiny | Pure Node ONNX. Toggle per-content via config.captions. Failure does not break pipeline. |
| Composition | `ffmpeg-static` + `fluent-ffmpeg` | Free OSS, ships ffmpeg binary. Ken Burns on stills, mux audio, optional burn-in subs. Aspect from config. |
| Storage | existing `public/media/` filesystem | Same as image provider. |
| Publish | extend `src/lib/instagram.ts:46-57` to route by `(targetSurface, mediaType)` to correct Meta endpoint. | See routing matrix below. |

### Meta Graph API routing matrix

In `src/lib/instagram.ts` publish step, dispatch by `(targetSurface, mediaType)`:

| targetSurface | mediaType | Meta API call |
|---------------|-----------|---------------|
| reel | video | `media_type=REELS`, `video_url`, then `/media_publish` |
| post | image | `image_url` only (current behavior), then `/media_publish` |
| post | video | `media_type=VIDEO`, `video_url`, then `/media_publish` |
| story | image | `media_type=STORIES`, `image_url`, then `/media_publish` |
| story | video | `media_type=STORIES`, `video_url`, then `/media_publish` |
| ad | * | not implemented v1 (Marketing API separate flow) |

## Render strategy

ffmpeg renders run in Node `worker_threads`. Non-blocking event loop, parallel-capable per CPU, crash-isolated. Avoid Redis/queue infra until scale.

- `src/lib/video/compose.worker.ts` - dedicated worker thread script. Receives `{scenes, audioPath, captionsPath?, outputPath, durationSec, aspectRatio}` via `parentPort`, runs fluent-ffmpeg, posts result back.
- `src/lib/video/compose.ts` - main-thread API wrapping worker spawn. Returns Promise resolving on worker message.
- `ffmpeg-static` resolved inside worker via `require("ffmpeg-static")`.

## Schema changes

`drizzle/schema.ts:19-41` rename `posts` → `content`:

```ts
export const content = sqliteTable("content", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id),
  mediaType: text("media_type").notNull(),       // image | video                        NEW
  targetSurface: text("target_surface").notNull(), // reel | post | story | ad           RENAMED from `type`
  content: text("content").notNull(),
  hashtags: text("hashtags"),
  mediaUrl: text("media_url"),                     // jpg or mp4
  publicMediaUrl: text("public_media_url"),
  script: text("script"),                          // video script                         NEW
  duration: integer("duration"),                   // seconds, video only                  NEW
  audioUrl: text("audio_url"),                     // narration mp3                        NEW
  captionsUrl: text("captions_url"),               // srt path if captions enabled         NEW
  config: text("config"),                          // generation config JSON snapshot      NEW
  status: text("status").notNull().default("draft"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  postedAt: integer("posted_at", { mode: "timestamp" }),
  instagramId: text("instagram_id"),               // KEEP per user
  hookUsed: text("hook_used"),
  pillarUsed: text("pillar_used"),
  targetType: text("target_type"),
  targetValue: text("target_value"),
  toneConstraints: text("tone_constraints"),
  visualDirection: text("visual_direction"),
  generationParams: text("generation_params"),
  discordMessageId: text("discord_message_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

Migration `drizzle/00XX_rename_posts_to_content.sql`:
- SQLite ALTER TABLE rename
- ADD COLUMN `media_type` (default `'image'` for legacy rows)
- Rename `type` → `target_surface`
- ADD COLUMNs: `script`, `duration`, `audio_url`, `captions_url`, `config`

`generationSchedules` (`schema.ts:62-73`):
- Add `mediaType: text` (image | video)
- Rename `contentType` → `targetSurface`
- Add `config: text` (JSON config tweaks override)

## Files to create

| File | Purpose |
|------|---------|
| `src/lib/content/defaults.ts` | DEFAULTS map keyed by `[targetSurface][mediaType]`. Helper `getDefaults(target, media): ConfigShape`. |
| `src/lib/providers/audio.ts` | `createMsEdgeTtsAudioProvider()`. Mirror `image.ts:7-50`. Inputs `{script, voice?, speed?}` → `{url, localPath, duration}`. Writes mp3 to `public/media/`. |
| `src/lib/providers/video.ts` | `createFfmpegVideoProvider()`. Inputs `{prompt, scenes, audioPath, captionsPath?, durationSec, aspectRatio}` → `{url, localPath}`. Spawns worker. |
| `src/lib/video/compose.ts` | Main-thread wrapper around worker spawn. |
| `src/lib/video/compose.worker.ts` | Worker thread entry. fluent-ffmpeg pipeline: stills + Ken Burns → audio mux → optional SRT burn → mp4 in target aspect. |
| `src/lib/captions.ts` | Optional Whisper transcription. `transcribeToSrt(audioPath): Promise<string \| null>`. Try/catch wrapper - return null on failure. |
| `src/lib/video/orchestrator.ts` | Top-level `generateVideoContent(input)`. Calls script LLM → splits scenes → generates stills (Pollinations) → narration (audio provider) → optional captions → composition (video provider). |

## Files to modify

| File | Change |
|------|--------|
| `drizzle/schema.ts:19-73` | Rename table `posts` → `content`. Add `mediaType`, `script`, `duration`, `audioUrl`, `captionsUrl`, `config`. Rename `type` → `targetSurface`. Update `generationSchedules` matching. |
| `src/lib/providers/types.ts:43-70` | Extend `VideoGenerationInput` with `scenes: SceneSpec[]`, `audioPath: string`, `captionsPath?: string`, `aspectRatio: string`, `durationSec: number`. Add `SceneSpec = { imageUrl: string, durationSec: number }`. |
| `src/lib/providers/factory.ts` | Add `createAudioProvider()` switching on `AUDIO_PROVIDER` env (default `msedge`). Add `createVideoProvider()` switching on `VIDEO_PROVIDER` env (default `ffmpeg`). |
| `src/instrumentation.ts` | Register video + audio providers at boot alongside text/image. |
| `src/lib/generate.ts:37-134` | Branch on `input.mediaType`. If `"video"` → `generateVideoContent()`. Else existing image path. Aspect ratio drawn from config (which was merged from defaults). Throw if `mediaType="video"` and no video provider registered (no fallback). |
| `src/lib/brain/prompts.ts:588-718` | Wire existing `buildScriptPrompt`, `buildVideoPrompt`, `buildAudioPrompt` from new orchestrator. Pass `targetSurface` so prompts can shape tone (reel-formula vs post-formula vs story-formula). |
| `src/lib/brain/types.ts:30` | `GeneratedText.script` already declared - populate. Add `scenes?: SceneSpec[]`. |
| `src/lib/instagram.ts:46-57` | Replace single `image_url` container call with dispatcher per routing matrix above. New helper `buildContainerParams(content)` returns the right Meta API body. |
| `src/app/api/media/[...path]/route.ts:24-27` | Extend MIME map: `.mp4 → video/mp4`, `.mp3 → audio/mpeg`, `.srt → application/x-subrip`. |
| `src/lib/discord.ts:92-94` | If `content.mediaType === "video"`, render link/embed instead of `setImage`. Discord auto-embeds mp4 URLs. |
| `src/lib/worker.ts:35-40` | Pass `schedule.mediaType`, `schedule.targetSurface`, `schedule.config` into `generateContent()`. |
| `src/app/api/generate/route.ts:6-14` | Body schema: `{ productId, mediaType, targetSurface, config?: object, count? }`. Server merges defaults from `getDefaults(targetSurface, mediaType)` then applies user-supplied `config` overrides. |
| `package.json` | Add deps: `msedge-tts`, `ffmpeg-static`, `fluent-ffmpeg`, `@types/fluent-ffmpeg`, `@xenova/transformers`. |

## UI changes

Generate form (likely `src/app/.../generate/page.tsx` or similar component):
- Step 1: radio `mediaType: image | video`
- Step 2: radio `targetSurface: reel | post | story | ad`. Reel option disabled when `mediaType=image`.
- Step 3: config tweaks rendered from `getDefaults(targetSurface, mediaType)`:
  - If video: `durationSec` number input, `captions` checkbox, `aspectRatio` select
  - If image: `aspectRatio` select
  - All pre-filled with defaults; user can edit

Schedule create/edit form mirrors same 3 steps, persists into `generationSchedules.{mediaType, targetSurface, config}`.

## Env vars

- `AUDIO_PROVIDER=msedge` (default)
- `VIDEO_PROVIDER=ffmpeg` (default)
- `TTS_VOICE=en-US-AriaNeural` (default; per-product override deferred)

(No env-driven duration. Duration lives in config per content.)

## Verification

1. `pnpm install` - new deps land.
2. `pnpm drizzle-kit migrate` - schema migration applies; old rows get `mediaType=image`, `targetSurface` from old `type`.
3. `pnpm dev` - app boots, providers register, no errors.
4. UI: open generate form. Pick `mediaType=video`, `targetSurface=reel`, accept defaults. Submit.
5. Confirm DB row: `mediaType=video`, `targetSurface=reel`, `script` populated, `mediaUrl` ends `.mp4`, `audioUrl` ends `.mp3`, `config` JSON has `durationSec=15`, `captions=true`.
6. `GET /api/media/<file>.mp4` - serves with `Content-Type: video/mp4`, plays in browser.
7. Discord channel: approval message with video preview/link.
8. Click approve - confirm appears in test IG account as a Reel via REELS endpoint.
9. Repeat with `targetSurface=post` + `mediaType=video` - confirm posts as Feed Video (not Reel).
10. Repeat with `targetSurface=story` + `mediaType=image` - confirm posts as Story.
11. Toggle `config.captions=false` - regenerate - confirm no SRT, no burned subs.
12. Toggle `config.captions=true` with intentional Whisper failure (rename model file) - confirm video still produced without captions, error logged.
13. Negative path: unset `VIDEO_PROVIDER` env, request video - confirm clear error, no silent image fallback.
14. Regression: image-only post path produces same output as before for `mediaType=image, targetSurface=post`.

## Critical files (quick ref)

- `src/lib/generate.ts:37-134` - main orchestrator branch point
- `src/lib/providers/types.ts:43-70` - video/audio interfaces (already correct shape)
- `src/lib/providers/registry.ts:3-75` - register/get pattern (already exposes video/audio slots)
- `src/lib/providers/image.ts:7-50` - reference factory pattern to mirror
- `src/lib/instagram.ts:46-57` - publish call site to extend with routing matrix
- `src/lib/brain/prompts.ts:588-718` - already-written script/video/audio prompts to wire
- `drizzle/schema.ts:19-73` - schema rename + new columns

## Defaults applied (no user input needed)

- Whisper model: `Xenova/whisper-tiny`
- TTS voice: `en-US-AriaNeural`
- IG Reels publish: `share_to_feed=true`, `cover_url` omitted
- IG Stories: no extra params beyond `media_type=STORIES`
- Scene durations: LLM-decided per script; sum constrained to `config.durationSec`
- Render: worker_threads, one worker per render
- Media retention: keep forever in `public/media/`

## Out of scope

- Multi-platform publishing (Post Bridge / TikTok / X / LinkedIn) - explicitly skipped.
- `socialAccounts` rename - dropped since multi-platform is out.
- Voice cloning / multi-voice / per-product brand-voice TTS.
- Server-side video preview thumbnails - Discord auto-embeds.
- Per-product voice/style override UI.
- Web playback page in Buzz UI - existing `/api/media/` route serves directly.
- Cloud SaaS compositors (Creatomate / Shotstack / JSON2Video).
- Marketing API for `targetSurface=ad` - deferred (separate Meta API, separate auth, separate flow).
- Local b-roll stock footage search - Pollinations stills + Ken Burns motion only.

## Unresolved questions

None. All decisions locked.
