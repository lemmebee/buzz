# TASK 10 (Model Picker) — CTO Review

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
> Balance: **1441.15 credits.** `models_explore` and `get_cost` are free; real generations are not.

**Verdict:** Structure is right, but the catalog fetch is broken. It returned **1 model out of ~30+**, with no type and no cost.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning
sqlite3 pragma table_info(products) → higgsfield_image_model, higgsfield_video_model present
```

Cache layer, API route, settings resolution and per-product columns all look correctly shaped. The problem is upstream of all of it.

## What `--models` actually produced

```
Refreshing models cache (this takes 1-3 minutes)...
[higgsfield] attempt 1 failed: Claude Code CLI exited with code 143. Retrying in 2000ms...
[higgsfield] attempt 1 failed: model "nano_banana_2" is a image model; use generate_image instead.
[higgsfield] attempt 2 failed: model nano_banana_2 is an image model, not a video model.

Fetched 1 models with 0 cost errors.

ID                    Type      Credits   Aspect Ratios   Durations
nano_banana_2         unknown   ?         —               —
                                                            4:21 total
```

Three defects, plus a design problem.

---

## MUST FIX

### M14 — The catalog relay is losing almost all the data

`models_explore(action:'list', type:'video', limit:40)` returns **30+ models** with full `parameters`, `medias`, `aspect_ratios`, `duration_range`. I called it directly to confirm — the tool is fine.

You got 1. The CLI agent is **summarising the tool result instead of relaying it**. That JSON is large (tens of KB), and an agent asked to "report the models" will paraphrase, truncate, or return only the first entry — exactly what happened.

**Fix:** make the agent a pure conduit and keep each payload small.

- Call **once per type** (`image`, then `video`) — never all at once.
- Instruct it explicitly: *"Output the tool result as raw JSON, verbatim, with no commentary, no summary, and no truncation. Do not describe the models."*
- Ask for a **reduced projection**, not the full objects. You only need: `id`, `name`, `provider_name`, `description`, `output_type`, `aspect_ratios`, `duration_range`/`durations`, and `medias[].roles`. Dropping `parameters` cuts the payload several-fold and removes the incentive to summarise.
- Parse defensively with `jsonrepair`, and **hard-fail** if fewer than 5 models come back for a type — a silent 1-model result is worse than an error, because it populates the cache with garbage.

Log the count fetched per type so truncation is visible immediately.

### M15 — `output_type` isn't being parsed, so costing calls the wrong tool

The table shows `Type: unknown`, and the cost step then called `generate_video` for `nano_banana_2` — an **image** model:

```
model "nano_banana_2" is a image model; use generate_image instead
```

`models_explore` returns `output_type` on every item. Read it, store it, and route the cost preflight by it: `output_type === "image"` → `generate_image`, `"video"` → `generate_video`. Skip anything that is neither (there are `audio` and `3d` entries, plus utility entries like `video_upscale` and `llm_text` that aren't generators at all).

**Filter out non-generator models entirely** — `video_upscale`, `video_deflicker`, `sam_3_video`, `topaz_video`, `bytedance_video_upscale`, `sync_so`, `video_background_remover`, `llm_text`, `clipify`. They pollute a picker meant for choosing a generation model.

### M16 — Sequential per-model cost preflight does not scale

**4 minutes 21 seconds for one model.** Each preflight is its own 20–60s CLI round-trip. At ~30 models that's 10–30 minutes per refresh — unusable, and it's the same time-sink pattern that has already cost us hours on this project.

**Fix: make cost lazy.**

1. **Refresh** fetches the catalog only — 2 CLI calls total (image + video). Fast, ~1 minute.
2. **Cost** is fetched **on demand** for a single model when the user selects it, or via an explicit per-model "check cost" action. One call, ~30s, cached thereafter.
3. Display `—` with a "check cost" affordance for models whose cost isn't cached yet. Never block the picker on pricing.

Seed the cache with the five costs already measured, so the common models show a price immediately:

| Model | Type | Credits |
|---|---|---|
| `marketing_studio_image` | image | 2 |
| `veo3_1_lite` | video | 4 |
| `kling3_0_turbo` | video | 7.5 |
| `seedance_2_0_mini` | video | 12.5 |
| `marketing_studio_video` | video | 60 |

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --models
```

Pass conditions:
- **20+ models** listed, not 1
- every row has a real `Type` (`image` or `video`), never `unknown`
- utility/non-generator models filtered out
- refresh completes in **under ~2 minutes** (catalog only, no bulk costing)
- the five seeded costs appear immediately

Paste the table.

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — that is Task 11.
- **Do NOT commit.**
- Report lint counts exactly as printed.
