# TASK 17 — 100% pipeline transparency (traces + dashboard)

> ## ⛔ RULE 0 — NO ASSET GENERATION
> Free: `tsc`, `lint`, `--balance`, `--cost`, `--models`, `--capabilities`, `--prompt`.
> Balance: **1441.15 credits.**

**Do Task 16 first** — it fixes the wrong-reference and sand-palette bugs, and re-extracts the profile. This task makes the pipeline observable so the next problem is diagnosable from the UI instead of from `pm2 logs`.

---

## Why

Every bug this feature hit — SVG logo, wrong media role, logo-instead-of-screenshot, sand palette, stale profile — was invisible in the product and only found by reading server logs. The user must be able to see **what was sent, to which model, with which inputs, at every step.**

What exists today is thin: `GenerationMetadata` carries `hookUsed`, `pillarUsed`, targeting, tone, `visualDirection`. **No prompts, no provider, no model, no cost, no timings, no asset decisions.**

---

## 1. Trace store

New table in `drizzle/schema.ts` (nullable columns, `npm run db:push`):

```ts
export const generationTraces = sqliteTable("generation_traces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id"),                 // links to jobs.id
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  contentId: integer("content_id"),      // set once a post is saved
  phase: text("phase").notNull(),        // extraction | context | prompt | assets | generate | download
  step: text("step"),                    // human label, e.g. "text-to-image"
  variationIndex: integer("variation_index"),
  engine: text("engine"),                // buzz | higgsfield
  provider: text("provider"),            // claude-code | gemini | higgsfield
  model: text("model"),                  // resolved model id
  input: text("input"),                  // JSON: prompts + resolved params
  output: text("output"),                // JSON: raw response / result summary
  credits: real("credits"),
  durationMs: integer("duration_ms"),
  status: text("status"),                // ok | error
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

Helper `src/lib/traces.ts`:
```ts
export async function trace(entry: NewTrace): Promise<void>          // fire-and-forget, never throws
export async function timed<T>(entry, fn: () => Promise<T>): Promise<T>  // wraps + records durationMs + errors
```

**Tracing must never break generation.** Wrap all writes in try/catch and swallow.

## 2. What to record

| Phase | Record |
|---|---|
| `extraction` | provider + model, the full prompt, raw LLM response, which source fields were used (brief, screenshots, logo), resulting profile/strategy diff |
| `context` | which product fields were present vs empty (planFile, profile, strategy, icp, jtbd, brainstorm ideas, IG handle), asset counts |
| `prompt` | text provider + model, **full system prompt and user prompt**, raw response, parsed imagePrompt/motionPrompt/caption/hashtags, the creative angle used |
| `assets` | each asset considered, its format, whether it was rasterised/skipped/used, **and why**; the resulting media_ids |
| `generate` | model, resolved aspect ratio, resolved duration, media role + values, the exact params object sent, cost preflight, job id, poll count, result URL |
| `download` | source URL, saved path, bytes |

Record the **resolved** values, not the requested ones — the whole point is seeing that 10s became 8s and that the logo was chosen over screenshots.

**Redact** anything matching the settings secret pattern before writing.

## 3. API

`src/app/api/traces/route.ts`
- `GET ?jobId=` — all traces for a job, ordered
- `GET ?contentId=` — traces for a saved post
- `GET ?productId=&phase=extraction` — extraction history

Return newest-first grouped by phase. Cap payloads; truncate very long prompt bodies with a `truncated: true` flag and a separate `GET /api/traces/[id]` for the full record.

## 4. UI — three surfaces

Build one reusable `<TraceViewer traces={...} />` component and use it in all three:

1. **Generate page** (`src/components/generate/GeneratedResults.tsx`) — a "Details" toggle per variation showing the timeline: context → prompt → assets → generate, each expandable to the raw input/output.
2. **Content detail** (`src/app/content/[id]/page.tsx`) — the full trace for that post, so a published asset can always be traced back to the prompt that made it.
3. **Product → Intelligence tab** — the extraction trace: what the profile was derived from, when, with which model, and the exact prompt.

Presentation rules:
- Collapsed by default; nothing changes for someone who does not care.
- Show a one-line summary per phase (`prompt · claude-code:haiku · angle "Lifestyle Context" · 1.2s`) and expand to raw JSON.
- Monospace for prompts, preserve newlines, copy button.
- Show **credits** prominently on the `generate` phase.
- Surface warnings inline — e.g. "logo skipped (SVG, rasterised)", "duration 10s → 8s", "role start_image → image".

Match existing component style. No new dependencies.

## 5. Make the existing metadata honest

`GeneratedPost.metadata` should also carry `engine`, `provider`, `model`, `credits` and `traceJobId` so the content list can show them without a join.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
npm run db:push
./node_modules/.bin/tsx scripts/test-higgsfield.ts --prompt 1
```

Then with the app running:
1. Trigger a **re-extract** on product 1 — confirm an `extraction` trace appears in the Intelligence tab with the full prompt and model.
2. Run `--prompt 1` and confirm `context` + `prompt` traces are written with the full system prompt.
3. Confirm `GET /api/traces?productId=1` returns them.

Paste the trace rows for the prompt phase.

**Do not run a generation.** The `generate` and `download` phases will be verified by the owner's single end-to-end run.

## Constraints

- Tracing is **additive and non-blocking** — a trace failure must never fail a generation.
- Applies to **both** engines. The `buzz` engine's prompt/model choices deserve the same visibility.
- `./node_modules/.bin/...`, never `npx`.
- Deploy only via `bash scripts/deploy-prod.sh`; verify `BUILD_ID` and fresh pm2 uptime.
- **Do NOT commit.**
- Report lint counts exactly as printed.
