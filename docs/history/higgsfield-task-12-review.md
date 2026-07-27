# TASK 12 — CTO Review

> ## ⛔ RULE 0 — NO ASSET GENERATION
> No image, video, or any asset generation. `get_cost`, `models_explore`, `--models`, `--capabilities`, `--prompt`, `tsc`, `lint` are free and sufficient.
> Balance: **1441.15 credits.**

**Verdict:** Accepted with one must-fix. The capability resolver works; duration lookup is incomplete, and it is costing you double.

---

## Verified

```
./node_modules/.bin/tsc --noEmit   → exit 0
npm run lint                       → 0 errors, 1 pre-existing warning
```

`--capabilities` across four models confirms the resolver is genuinely dynamic:

| Model | Role | Refs | Notable |
|---|---|---|---|
| `marketing_studio_image` | `image` | ✅ | `ad → 4:5` |
| `veo3_1_lite` | `start_image` | ✅ | audio default false |
| `seedream_v5_pro` | `image_references` | ✅ | `ad → 1:1` — correct fallback, it has no 4:5 |
| `recraft_v4_1` | — | ⚠️ | correctly flagged as unusable with product images |

Three distinct role families resolving correctly, and the aspect fallback logic demonstrably working. That was the point of the task.

---

## MUST FIX

### M17 — `duration` can live in `parameters[]`, and you're missing it

Your `--capabilities` output for `veo3_1_lite` says:

```
Durations:
  Not declared

Parameters:
  duration: number
    Options: 4, 6, 8
    Default: 8
```

It **is** declared — just not where `resolveDuration()` looks. Duration appears in **three** different places across the catalog:

| Shape | Example models |
|---|---|
| top-level `durations: [5,10]` | `cinematic_studio_video` |
| top-level `duration_range: {min,max}` | `kling3_0`, `seedance_2_0`, `cinematic_studio_3_0` |
| **`parameters[]` entry named `duration`** with `options[]` or `min`/`max` | **`veo3_1_lite`**, `minimax_hailuo`, `wan2_6`, `seedance1_5` |

`resolveDuration()` only reads the first two, returns `undefined` for `veo3_1_lite`, and the model falls back to its own default of **8**.

### This is a real cost bug, not a cosmetic one

Your `--cost` reported **8 credits** for `veo3_1_lite`. I measured **4** with `duration: 4`. Cost scales with duration:

| duration | credits |
|---|---|
| 4 | **4** |
| 8 (current default) | **8** |

Every video costs double what it needs to, silently, because the duration parameter is never sent.

**Fix:** in `resolveDuration()`, fall back to scanning `parameters[]` for an entry named `duration` and use its `options[]` (snap to nearest) or `min`/`max` (clamp). Then pass the resolved duration in the params object.

Given social clips, **default to the shortest sensible option** — 4s for `veo3_1_lite` — rather than the model's own default. Log the chosen duration at `[higgsfield]`.

Apply the same fallback for `resolution` and `quality` where models declare them in `parameters[]`, since those also drive cost.

---

## SHOULD FIX

### S11 — Surface the cost/duration relationship in the picker
Now that duration is a real lever, show it. When a video model is selected, let the user pick the duration from the resolved options and display the cost for that choice ("4s — 4 credits · 8s — 8 credits"). It turns an invisible 2× cost difference into an explicit choice.

Cost varies with `resolution`, `quality`, `batch_size` and `generate_audio` too — keep labelling stored figures as "cost at default params".

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --capabilities veo3_1_lite
./node_modules/.bin/tsx scripts/test-higgsfield.ts --cost
```

Pass conditions:
- `--capabilities veo3_1_lite` reports durations **4, 6, 8** (not "Not declared")
- `--cost` reports video **4 credits** (not 8)

Paste both.

**No real generations.**

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — that is Task 11.
- **Do NOT commit.**
- Report lint counts exactly as printed.
