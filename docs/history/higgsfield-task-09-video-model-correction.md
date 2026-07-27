# TASK 09 — Correction: DoP does not exist on the MCP. Use `veo3_1_lite`.

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
> No `--generate`, no `--generate-video`, no `generate_image` / `generate_video` call.
> Allowed (free): `tsc`, `lint`, `--balance`, `--cost`, `--prompt`, reading files on disk.
> If you think a real generation is needed, **stop and ask**, stating the credit cost.
> Balance: **1441.15 credits.**

---

## What went wrong

Task 08 told you to set `HIGGSFIELD_VIDEO_MODEL` to `higgsfield-ai/dop/turbo`. Your `--cost` run correctly rejected it:

```
[higgsfield] attempt 1 failed: unknown model higgsfield-ai/dop/turbo
[higgsfield] attempt 2 failed: Model 'higgsfield-ai/dop/turbo' not found in catalog
```

**My error.** The `higgsfield-ai/dop/*` slugs came from the REST API's `GET /models`. **The MCP uses a completely different catalog** — there are no DoP models on it at all. Two separate product surfaces, two separate model namespaces. Your implementation was right; the model id I gave you was not.

Nothing else from Task 08 needs reverting. The two-step chain, the cost preflight, `hfUploadFile()` — all still correct. Only the model id changes.

## Verified MCP video pricing

All measured with free `get_cost` preflights (no generation):

| Model | Credits | Duration | start_image | Notes |
|---|---|---|---|---|
| `marketing_studio_video` | **60** | 12–15s | yes | current default; built-in ad structure + audio |
| `seedance_2_0_mini` | 12.5 | 5s | yes | budget Seedance |
| `kling3_0_turbo` | 7.5 | 5s | yes | fast turbo |
| **`veo3_1_lite`** | **4** | 4/6/8s | yes | **cheapest**; audio off by default |

## Decision: `veo3_1_lite`

**Set `getHiggsfieldVideoModel()` default to `veo3_1_lite`.**

Cost per video becomes **image 2 + video 4 = 6 credits**, down from 60. That's **~240 videos** on the current balance instead of 24.

Contract (from `models_explore(action:'get')`):
- `medias[].roles`: `start_image`, `end_image` — use **`start_image`** for the chain
- `aspect_ratios`: `16:9`, `9:16`, `auto` — **no 1:1 and no 4:5**
- `duration`: one of `4`, `6`, `8` (not a free range)
- `generate_audio`: defaults to **false**; enabling it raises the cost, so leave it off unless asked

### Aspect-ratio consequence

`veo3_1_lite` cannot do `1:1` or `4:5`. Your image path maps `post → 1:1` and `ad → 4:5`. For **video**, map:

```
post   -> "16:9"
ad     -> "16:9"
story  -> "9:16"
reel   -> "9:16"
```

Warn at `[higgsfield]` when a surface's preferred ratio isn't available and a fallback is used. Do not silently send an unsupported value.

### Duration

`config.duration` must snap to the nearest of `4 | 6 | 8`. Log when it is adjusted. Take the actual duration from the completed job params, else `probeDuration()`. **Never fabricate it.**

---

## Work

1. `src/lib/settings.ts` — `getHiggsfieldVideoModel()` default → `veo3_1_lite`.
2. Video aspect-ratio map as above, with a fallback warning.
3. Duration snapping to `4 | 6 | 8`, with a log line when adjusted.
4. Use role `start_image` for the chained still.
5. Leave `generate_audio` off (default false) — it costs extra.

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --cost
```

Expected: **image 2, video 4.** Paste that output — the cost drop from 60 → 4 is this task's deliverable.

**Do not run `--generate-video`.**

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — engine wiring is Phase 6.
- **Do NOT commit.**
- Report lint counts exactly as printed.
