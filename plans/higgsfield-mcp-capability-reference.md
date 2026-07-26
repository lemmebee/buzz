# Higgsfield MCP — Capability Reference

> Everything Buzz needs to integrate Higgsfield. All facts below were verified live against the MCP via free calls (`models_explore`, `get_cost`). **No assets were generated to produce this document.**
>
> Last verified: 2026-07-26. Balance: 1441.15 credits.

---

## 1. Transport

Buzz reaches Higgsfield by spawning the **Claude Code CLI**, which carries the **Plus subscription credits**. The REST API (`platform.higgsfield.ai`) bills a *separate, empty* wallet and is abandoned.

```bash
claude --print --model haiku \
  --mcp-config higgsfield-mcp.json --strict-mcp-config \
  --allowedTools 'mcp__claude_ai_HiggsField__<tool>'
```

**MCP isolation is mandatory.** Without `--strict-mcp-config`, every spawn health-checks all configured MCP servers (Linear, Drive, Gmail, Calendar, Notion, claude-mem) plus hooks and plugins. Measured: 60s–5min per call, ~30% failure. With isolation: **22–54s, 5/5 success.**

One-time setup: run the CLI interactively once with that `--mcp-config` and authenticate via `/mcp`. The token caches to `~/.claude/.credentials.json`.

### The courier rule

**Node owns the params object. The agent is a courier, not an author.**

Build the full params object in TypeScript, `JSON.stringify` it, and instruct the agent to pass it *verbatim*. Describing parameters as prose bullets causes the model to **reconstruct** the object and silently drop fields — this is what dropped `medias` for two review cycles.

### Async job lifecycle

`generate_image` / `generate_video` return a **pending job**, not a result:

```json
{"results":[{"id":"<uuid>","status":"pending"}]}
```

Poll `job_status` until terminal. While running: `{"generation":{"status":"in_progress"},"poll_after_seconds":2}`. On completion:

```json
{"status":"completed",
 "result_url":"https://d8j0ntlcm91z4.cloudfront.net/.../file.png",
 "min_result_url":"...",
 "params":{...,"input_images":[...]}}
```

Statuses: `queued | in_progress | completed | failed | nsfw`.

**Do the polling inside a single CLI call** (both tools in `--allowedTools`). Polling from Node with repeated spawns costs ~20s each.

---

## 2. Reference images — THE critical integration fact

**The media role name varies per model.** There is no universal value. Sending the wrong one is accepted silently and the reference is ignored — `input_images` comes back `[]` and the model invents a fake product.

Three families:

| `medias[].roles` | Models |
|---|---|
| **`["image"]`** | `marketing_studio_image`, `ms_image`, `nano_banana_2`, `nano_banana_pro`, `soul_2`, `soul_v2`, `soul_cinematic`, `gpt_image_2`, `cinematic_studio_2_5`, `image_auto` |
| **`["image_references"]`** | `nano_banana`, `nano_banana_2_lite`, `nano_banana_2_shots`, `seedream_v4_5`, `seedream_v5_lite`, `seedream_v5_pro`, `flux_2`, `flux_kontext`, `kling_omni_image`, `openai_hazel`, `grok_image` |
| **`[]` — no reference support at all** | `recraft_v4_1`, `z_image`, `soul_cast`, `soul_location` |

Video models use `start_image`, `end_image`, `image`, and some accept `image_references` / `video_references` / `audio_references`.

**Consequence:** Buzz must read `medias[].roles[0]` from the cached catalog per selected model. Never hardcode. And a model with `medias: []` **can never show the real product** — the picker must warn or exclude it when product assets exist.

### Reference count limits

`medias[].max` varies and is often absent:

| Model | max |
|---|---|
| `soul_2`, `soul_v2`, `soul_cinematic`, `autosprite` | 1 |
| `ms_image` | 14 |
| `marketing_studio_image` | not declared, but **2 fails** — treat as 1 |

Where `max` is absent, default to **1**. Exceeding it returns a generic `Error starting generation: Something went wrong` with a request ID — no useful message.

### Correct call shape (verified)

```json
{"params":{
  "model":"marketing_studio_image",
  "prompt":"...",
  "aspect_ratio":"1:1",
  "medias":[{"value":"<media_id>","role":"image"}]
}}
```

`medias` lives **inside `params`**. `value` is a media_id — never a URL. Confirm success by checking the completed job's `params.input_images` is non-empty.

---

## 3. Media upload — three steps

The MCP does **not** accept bytes, and it cannot fetch `localhost` URLs.

1. `media_upload({filename, content_type})` → `{media_id, upload_url}` (presigned S3)
2. **Node PUTs the bytes** to `upload_url` — do this in Node with `fetch`, never via the agent shelling out to `curl` (it stalls on permission approval in `--print` mode)
3. `media_confirm({media_id, type:"image"})`

`media_upload` supports `files[]` for batch presigning — one call can presign many files.

**Only cache a media_id after `media_confirm` succeeds.** An unconfirmed id is accepted into the cache but fails every future generation, silently and permanently. This happened and cost a full debug cycle.

`media_import_url` imports a **public** HTTPS URL directly (max 50 MB) — useful only for already-public assets.

---

## 4. Cost model

`get_cost: true` returns the price **without submitting a job** — free, and the only safe way to price a model.

```json
{"cost":{"credits":4,"credits_exact":4}}
```

Measured:

| Model | Type | Credits |
|---|---|---|
| `marketing_studio_image` | image | 2 |
| `veo3_1_lite` | video | **4** |
| `kling3_0_turbo` | video | 7.5 |
| `seedance_2_0_mini` | video | 12.5 |
| `marketing_studio_video` | video | **60** |

Cost scales with `resolution`, `duration`, `quality`, `batch_size`, and `generate_audio`. **A stored figure is only valid for the params it was measured at** — label it "cost at default params", never as a guaranteed price.

Catalog size: **48 generator models** (26 image, 22 video) after filtering utilities.

---

## 5. Notable models for Buzz

- **`marketing_studio_image`** (2 cr) — current default. Product ad images, accepts one reference. Verified producing the real Tanda UI.
- **`veo3_1_lite`** (4 cr) — cheapest video. `start_image` + `end_image`, durations `4|6|8`, aspect `16:9`/`9:16`/`auto` only (**no 1:1, no 4:5**), audio off by default.
- **`ms_image` (DTC Ads)** — the strongest long-term fit, not yet used. Supports **`brand_kit_id`** (logo, images, colours, fonts, tone folded into the prompt), **`product_ids`** (up to 4), curated ad `style_id`, and up to 14 reference images. Requires `style_id` — list via `show_marketing_studio(type:'image_style')`. Worth a dedicated investigation.
- **`recraft_v4_1`** — has brand `colors[]` and `background_color` params but **cannot accept reference images**. Good for logo/vector work, useless for showing the real product.

### Marketing Studio entities

`show_marketing_studio` manages `brand_kit`, `product`, `image_style`, `hook`, `setting`, `ad_reference`. Registering Tanda once as a **product** + **brand kit** would give consistent identity across every generation, replacing ad-hoc `medias` passing. This is the natural next evolution of the asset layer.

---

## 6. Prompt vs reference conflict

When a prompt describes its own colours or styling, the model **restyles the reference** and invents on-screen text. Observed: a real dark-theme app repainted in sand tones with fabricated labels ("Parcern", "Bry walent", "Converriance", "Progress of 230%").

**Rule:** when a reference image is attached, the prompt must describe **only the scene around the subject** — surface, lighting, camera angle, mood — plus an explicit fidelity instruction: *"Reproduce the provided reference exactly as supplied; do not restyle, recolour, or alter any content within it."* Brand palette guidance applies to the environment, not the subject.

Verified: this produces the real UI with correct data.

---

## 7. What "dynamic" requires

For users to choose any model by credits and capabilities, everything below must come from the **cached catalog**, never from constants:

| Property | Source | Used for |
|---|---|---|
| media role | `medias[].roles[0]` | building `medias[]` |
| max references | `medias[].max` (default 1) | capping the array |
| aspect ratios | `aspect_ratios[]` | mapping `targetSurface` with fallback |
| durations | `durations[]` or `duration_range` | snapping `config.duration` |
| model params | `parameters[]` | resolution / quality / audio options |
| cost | `get_cost` preflight | display + guardrails |
| reference support | `medias.length > 0` | warn when product assets can't be used |

Any hardcoded assumption here becomes a silent wrong-output bug, because the API accepts bad values without complaint.
