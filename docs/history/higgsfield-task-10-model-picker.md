# TASK 10 — Model picker UI: choose any Higgsfield model, with capabilities and credits

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
> No `--generate`, no `--generate-video`, no `generate_image` / `generate_video` call **without `get_cost: true`**.
> `models_explore` and `get_cost` preflights are **free** and are the only Higgsfield calls this task needs.
> If you think a real generation is needed, **stop and ask**, stating the credit cost.
> Balance: **1441.15 credits.**

---

## Goal

Stop hardcoding model ids in settings. Let the user pick **any** Higgsfield model from a UI that shows, per model: what it does, what it accepts, and what it costs.

Replaces the current free-text `HIGGSFIELD_IMAGE_MODEL` / `HIGGSFIELD_VIDEO_MODEL` string settings, which are unguessable and silently fail on a wrong id (as we just proved with `higgsfield-ai/dop/turbo`).

---

## Where the data comes from

`models_explore` is a **free, read-only** MCP tool.

```
models_explore(action:'list', type:'image'|'video'|'audio'|'3d', limit:100)
```

Returns per model: `id`, `name`, `provider_name`, `description`, `output_type`, `parameters[]` (with options/defaults/ranges), `medias[]` (with `roles`), `aspect_ratios[]`, `tags[]`, and `duration_range` or `durations[]`.

Credits come from a separate **free** preflight — call `generate_image` / `generate_video` with `get_cost: true` and no real job is submitted:

```json
{"cost":{"credits":4,"credits_exact":4}}
```

**Measured examples (already verified):**

| Model | Type | Credits |
|---|---|---|
| `marketing_studio_image` | image | 2 |
| `veo3_1_lite` | video | 4 |
| `kling3_0_turbo` | video | 7.5 |
| `seedance_2_0_mini` | video | 12.5 |
| `marketing_studio_video` | video | 60 |

Note credits vary with `duration`, `resolution`, and `generate_audio`. Treat the stored number as **"cost at default params"** and label it that way in the UI — never present it as a guaranteed price.

---

## Work

### 1. Client: catalog + cost helpers
`src/lib/higgsfield/client.ts`:
```ts
export async function hfListModels(type?: "image"|"video"|"audio"|"3d"): Promise<HiggsfieldModel[]>
export async function hfModelCost(modelId: string, type: "image"|"video"): Promise<number|null>
```
Use the courier pattern (Node builds params, `JSON.stringify`, agent passes verbatim). `models_explore` needs only `mcp__claude_ai_HiggsField__models_explore` in `--allowedTools`.

`hfModelCost` returns `null` on failure — **never a fabricated number.**

### 2. Cache the catalog
A CLI round-trip is 20–60s, far too slow for a settings page render.

Add a `higgsfield_models` table (or a single JSON blob in `settings`, your call — justify whichever you pick):
`modelId`, `type`, `name`, `provider`, `description`, `capabilities` (JSON: aspect_ratios, durations, roles, parameters), `baseCredits`, `fetchedAt`.

- Settings page reads **only** from cache — never blocks on the CLI.
- A **"Refresh models"** button repopulates it (catalog + per-model cost preflights).
- Show `fetchedAt` in the UI so staleness is visible.

Refresh is slow (one catalog call + one preflight per model). Run it as a background job and stream progress, or state plainly in the UI that it takes a few minutes. **Do not** silently block the page.

### 3. API route
`src/app/api/settings/higgsfield-models/route.ts`
- `GET` → cached models, optional `?type=image|video`
- `POST` → trigger refresh (fire-and-forget, matching the `/api/jobs/process` pattern already in the codebase)

Follow the conventions of the existing `antigravity-models` / `claude-code-models` routes.

### 4. Settings UI
`src/app/settings/page.tsx` — replace the two text inputs with pickers.

Each option shows:
- **name** + provider (e.g. "Veo 3.1 Lite — Google")
- **credits** at default params (e.g. "4 credits")
- **capabilities**: aspect ratios, durations, whether it accepts a start image, whether audio is available
- the one-line description

Sort by credits ascending — cheapest first. That makes the 4 vs 60 difference impossible to miss.

Match the surrounding component style exactly. Keep it simple; a `<select>` with a capability summary panel beneath is enough. No new dependencies.

### 5. Per-product override
`products` already has `image_provider` / `video_provider` columns. Add nullable `higgsfield_image_model` and `higgsfield_video_model`, and surface the same picker in the product edit UI. Resolution order: **product → global setting → default**, matching the existing pattern.

`npm run db:push`. New columns nullable.

### 6. Validate on save
When a model is selected, check it exists in the cached catalog and that its `output_type` matches the slot (image model in the image slot). Reject with a clear message rather than storing an id that will fail at generation time.

### 7. Guard the expensive ones
Where a selected video model costs **> 20 credits at default params**, show an inline warning next to the picker: *"High cost per generation — not recommended for scheduled runs."*

This is the UI half of the earlier decision: images may run in the scheduled worker; **video stays user-triggered.**

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --models     # add this mode
```

`--models` should print the fetched catalog as a table: id, type, credits, aspect ratios, durations. Paste it.

Then run the app and confirm the settings page renders the pickers from cache with no CLI call on page load.

**Do not run any real generation.**

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Do not touch `src/lib/generate.ts` — engine wiring is the next task.
- Do not modify the Remotion/spec pipeline.
- **Do NOT commit.**
- Report lint counts exactly as printed.
