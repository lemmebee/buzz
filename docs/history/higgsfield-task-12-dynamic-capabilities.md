# TASK 12 — Make everything capability-driven (no hardcoded model assumptions)

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
> **NO image generation. NO video generation. NO asset generation of any kind.**
> Allowed (free): `tsc`, `lint`, `--balance`, `--cost` (`get_cost` preflight), `--models`, `--prompt`, `models_explore`, reading files on disk.
> If you believe a real generation is required, **stop and ask**, stating the credit cost.
> Balance: **1441.15 credits.**

**Read first:** `plans/higgsfield-mcp-capability-reference.md` — the full verified MCP contract. Everything in this task derives from it.

---

## Task 10 review — accepted ✅

Verified on your tree:

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 ✅ |
| `npm run lint` | 0 errors, 1 pre-existing warning ✅ |
| `--models` | **48 models** (26 image + 22 video) ✅ |
| Types | all real, no `unknown` ✅ |
| Utilities filtered | ✅ |
| Refresh time | **44s** (was 4m21s) ✅ |
| Seeded costs | visible ✅ |

M14, M15 and M16 all fixed. Good round.

**One cosmetic bug:** the `--models` table has no column separator between aspect ratios and durations, so they run together — `9:164-15s`, `3:45, 10`. Pad the aspect-ratio column.

---

## The problem this task solves

The picker now lists 48 models, but the generation code still assumes **one** model's shape. Pick anything other than `marketing_studio_image` and it breaks silently.

**The role name is not universal.** Verified from the live catalog:

| `medias[].roles` | Models |
|---|---|
| `["image"]` | `marketing_studio_image`, `ms_image`, `nano_banana_2`, `nano_banana_pro`, `soul_2`, `soul_v2`, `soul_cinematic`, `gpt_image_2`, `cinematic_studio_2_5`, `image_auto` |
| `["image_references"]` | `nano_banana`, `nano_banana_2_lite`, `seedream_v4_5`, `seedream_v5_lite`, `seedream_v5_pro`, `flux_2`, `flux_kontext`, `kling_omni_image`, `openai_hazel`, `grok_image` |
| `[]` — **no reference support** | `recraft_v4_1`, `z_image`, `soul_cast`, `soul_location` |

Sending the wrong role is **accepted without error** — `input_images` comes back empty and the model invents a fake product. Exactly the failure that cost two review cycles.

---

## Work

### 1. Persist full capabilities in the cache
The catalog fetch currently drops `medias`. Store per model: `medias[].roles`, `medias[].max`, `medias[].required`, `aspect_ratios[]`, `durations[]` / `duration_range`, and `parameters[]`.

Keep the payload lean by projecting only these fields — do not store whole raw objects.

### 2. Capability resolver — `src/lib/higgsfield/capabilities.ts`

```ts
export function resolveMediaRole(model: CachedModel): string | null   // medias[0].roles[0] ?? null
export function resolveMaxMedias(model: CachedModel): number          // medias[0].max ?? 1
export function supportsReferences(model: CachedModel): boolean       // medias.length > 0
export function resolveAspectRatio(model: CachedModel, surface: ContentPurpose): string
export function resolveDuration(model: CachedModel, requested?: number): number | undefined
```

- **Aspect ratio:** preferred per surface (`post→1:1`, `story/reel→9:16`, `ad→4:5`), then first available fallback from `aspect_ratios[]`, then `auto`. Log at `[higgsfield]` whenever a fallback is used.
- **Duration:** snap to nearest allowed value from `durations[]`, or clamp into `duration_range`. Log when adjusted. Omit entirely if the model declares neither.
- **Max medias:** default **1** when `max` is absent. `marketing_studio_image` does not declare a max but **fails with 2** — 1 is the safe default.

### 3. Use the resolver in `client.ts` / `orchestrator.ts`
Replace every hardcoded value:
- `role: "image"` → `resolveMediaRole(model)`
- the 1-media cap → `resolveMaxMedias(model)`
- the aspect map → `resolveAspectRatio(model, surface)`
- duration snapping → `resolveDuration(model, config.duration)`

If `supportsReferences(model)` is false, **skip `medias` entirely** and log that product assets cannot be used with this model. Do not send an empty array.

### 4. Surface capability in the picker
For each model in the settings UI, show:
- **"Uses your product images"** ✅ / **"Cannot use product images"** ⚠️ (from `supportsReferences`)
- supported aspect ratios and durations
- cost at default params, or a "check cost" action

Warn when a model that cannot use references is selected while the product has a logo or screenshots — that combination silently produces invented products.

### 5. Validate on save
Reject a model whose `output_type` does not match the slot. Warn (do not block) when the model cannot use references.

---

## Also still outstanding

**Task 09 was never applied.** `HIGGSFIELD_VIDEO_MODEL` still defaults to a model id that does not exist on the MCP.

Set the default to **`veo3_1_lite`** (4 credits, vs 60 for `marketing_studio_video`). Its constraints, now handled by the resolver: aspect `16:9`/`9:16`/`auto` only, durations `4|6|8`, role `start_image`, audio off by default.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --models
./node_modules/.bin/tsx scripts/test-higgsfield.ts --cost
```

Pass conditions:
- `--models` table is readable, columns separated
- `--cost` shows image 2, video **4** (not 60, not an unknown-model error)
- add a `--capabilities <modelId>` mode printing the resolved role, max medias, aspect ratio for each surface, and duration handling — paste it for `marketing_studio_image`, `veo3_1_lite`, `seedream_v5_pro` (different role family) and `recraft_v4_1` (no reference support)

**Do not run any real generation.**

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — that is Task 11.
- **Do NOT commit.**
- Report lint counts exactly as printed.
