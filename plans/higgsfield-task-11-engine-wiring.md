# TASK 11 — Phase 6: Engine wiring (make the feature actually usable)

> ## ⛔ RULE 0 — DO NOT GENERATE ANY ASSET
> No `--generate`, no `--generate-video`, no `generate_image` / `generate_video` call without `get_cost: true`.
> Allowed (free): `tsc`, `lint`, `--balance`, `--cost`, `--prompt`, `models_explore`, reading files on disk.
> If you think a real generation is needed, **stop and ask**, stating the credit cost.
> Balance: **1441.15 credits.**

**Do this after Task 10.** This is the task that turns everything built so far into a feature the user can click.

---

## Goal

Right now the Higgsfield engine only runs through `scripts/test-higgsfield.ts`. After this task, setting `CONTENT_ENGINE=higgsfield` makes the existing `/generate` page produce Higgsfield content — with **no changes to any API route or to the generate UI itself.**

Everything downstream is reused for free: `POST /api/generate`, the `jobs` table, `processJob`, fire-and-forget processing, the 2s client polling in `src/app/generate/page.tsx`, cancel support, the `GeneratedPost` shape, `classifyProviderError`, and persistence via `POST /api/posts`.

---

## Work

### 1. `resolveContentEngine(productId)`

Add to `src/lib/settings.ts` (or `src/lib/higgsfield/index.ts` — pick one and be consistent):

```ts
export async function resolveContentEngine(productId?: number): Promise<"buzz" | "higgsfield">
```

Resolution order, matching the existing provider pattern:
**product column → global `CONTENT_ENGINE` setting → `"buzz"`**

Anything unrecognised falls back to `"buzz"` with a `[higgsfield]` warning. The default engine must never break because of a bad settings value.

### 2. Per-product column

`drizzle/schema.ts` — add nullable to `products`:
```ts
contentEngine: text("content_engine"),   // "buzz" | "higgsfield" | null
```
`npm run db:push`. Nullable, per the convention documented on `jobs.cancelRequested`.

> Note: `products.videoProvider` already exists but is **never read** — the orchestrators call the global `getVideoProvider()`. Do not replicate that bug here. `resolveContentEngine` must actually consult the column.

### 3. The branch — `src/lib/generate.ts`

This is the entire integration:

```ts
export async function generateContent(input, hooks) {
  const { mediaType, targetSurface, config: userConfig } = input;
  const config: ContentConfig = { ...getDefaults(targetSurface, mediaType), ...(userConfig || {}) };

  const engine = await resolveContentEngine(input.productId);        // NEW
  if (engine === "higgsfield") {                                     // NEW
    const { generateHiggsfieldContent } = await import("@/lib/higgsfield/orchestrator");
    return generateHiggsfieldContent({ ...input, config }, hooks);
  }

  if (mediaType === "video") {
    const { generateVideoContent } = await import("@/lib/video/orchestrator");
    return generateVideoContent({ ...input, config }, hooks);
  }

  const { generateImageContent } = await import("@/lib/image/orchestrator");
  return generateImageContent({ ...input, config }, hooks);
}
```

Use the lazy `await import()` form, matching the existing branches — it keeps the Higgsfield module and its dependencies off the default `buzz` path entirely.

**Nothing else in this file changes.**

### 4. Settings UI — `src/app/settings/page.tsx`

Add a **Content Engine** select: `buzz` (default) | `higgsfield`.

Label them for a human, not for a developer:
- **Buzz** — "Buzz composes the design itself. Full control over typography and brand. Free."
- **Higgsfield** — "Higgsfield generates the media. Photoreal, uses credits."

Show the current Higgsfield credit balance next to the option when `higgsfield` is selected, read from cache — **do not** call `--balance` on page render (it is a 20–60s CLI round-trip).

Match the surrounding component style. No new dependencies.

### 5. Product edit UI

Add the same engine select to `src/components/ProductForm.tsx`, with an explicit "Use global setting" option that stores `null`.

### 6. Keep video out of the scheduled worker

`src/lib/worker.ts` (`runScheduledGeneration`) generates on a 5-minute cron.

**When the resolved engine is `higgsfield` and `mediaType === "video"`, skip the scheduled run** and log a clear `[higgsfield]` line explaining why.

Rationale: images are ~2 credits, video is 4–60. A cron job that silently spends credits on every tick is not acceptable. Images may run scheduled; **video must be user-triggered only.**

### 7. Failure surfacing

When `CONTENT_ENGINE=higgsfield` but the transport is unusable — Claude CLI missing, MCP unavailable, zero credits — every variation must fail with **one clear, actionable message**, not a stack trace. Reuse `classifyProviderError`. `isTerminalProviderError` should already stop the batch on a credit failure; confirm it does.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
npm run db:push
```

Then run the app (`npm run dev`) and verify by hand:

1. **`CONTENT_ENGINE=buzz` (default) — the critical regression check.** Generate an image for a product. The existing spec/Remotion pipeline must behave **exactly as before**. Confirm `[image]`-prefixed logs, not `[higgsfield]`.
2. Switch the global setting to `higgsfield`, generate an image, confirm `[higgsfield]` logs appear and a post streams into the results panel. **This spends ~2 credits — do this once, and only once.** It is the single sanctioned generation for this task.
3. Set a per-product override to `buzz` while the global is `higgsfield`; confirm the product override wins.
4. Confirm the scheduled worker skips higgsfield video with the explanatory log.

Report which of the four you exercised and paste the relevant log lines.

## Constraints

- **Additive only.** The `buzz` engine's behaviour must be byte-for-byte unchanged. Do not refactor, reformat, or "improve" the spec/Remotion/creative-director pipeline.
- `./node_modules/.bin/...`, never `npx`.
- New DB columns nullable; `npm run db:push`, never `db:generate`/`db:migrate`.
- **Do NOT commit.**
- Report lint counts exactly as printed.

## Report back with

1. Files created/modified
2. Literal `tsc` / `lint` / `db:push` output
3. Which of the four manual checks you ran, with log lines
4. Confirmation that `CONTENT_ENGINE=buzz` behaviour is unchanged
