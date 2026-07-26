# TASK 13 — Settings-only config + Phase 7 hardening (final task)

> ## ⛔ RULE 0 — NO ASSET GENERATION
> No image, video, or any asset generation. Free and sufficient: `tsc`, `lint`, `--balance`, `--cost`, `--models`, `--capabilities`, `--prompt`, `models_explore`.
> Balance: **1441.15 credits.**

**Task 11 accepted.** Verified: `tsc` exit 0, lint 0 errors, the `generate.ts` branch is exactly as specified with lazy import, the worker guard skips higgsfield video with a clear log, and `content_engine` is on `products`.

---

## Part 1 — Config belongs in Settings, not `.env`

**New standing rule:** `.env` holds **secrets and infrastructure only**. Everything else lives in the `settings` table and is editable in the Settings UI.

### Secrets / infra — stay in `.env` (do not move)
`ADMIN_PASSWORD`, `GOOGLE_AI_API_KEY`, `HUGGINGFACE_API_KEY`, `POLLINATIONS_API_KEY`, `HIGGSFIELD_CREDENTIALS`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `CRON_SECRET`, `INSTAGRAM_REDIRECT_URI`, `DATABASE_PATH`, `NEXT_PUBLIC_BASE_URL`, `GOOGLE_CLOUD_PROJECT_ID`.

`getApiKey()` keeps its DB-then-env fallback — secrets may come from either.

### Config — move to Settings, stop reading `process.env`

Currently `src/lib/settings.ts` reads env for all of these:

| Key | Line |
|---|---|
| `TEXT_PROVIDER` | 14 |
| `IMAGE_PROVIDER` | 22 |
| `VIDEO_PROVIDER` | 30 |
| `CONTENT_ENGINE` | 49 |
| `HIGGSFIELD_IMAGE_MODEL` | 88 |
| `HIGGSFIELD_VIDEO_MODEL` | 105 |
| `IMAGE_STYLE` | 114 |

Plus `IMAGE_MODEL_HUGGINGFACE`, and the binary/model settings read elsewhere: `ANTIGRAVITY_BIN`, `ANTIGRAVITY_MODEL`, `CLAUDE_CODE_BIN`, `CLAUDE_CODE_MODEL`.

### Migration — one-time seed, then settings-only

Do **not** simply delete the env fallbacks; that would silently change behaviour for anyone currently configured via `.env`.

1. Add `seedSettingsFromEnv()` — for each config key, **if no DB row exists** and the env var is set, insert the env value as the DB row and log `[settings] seeded <KEY> from env`.
2. Call it once at startup from `src/instrumentation.ts`, next to the existing worker boot.
3. **Then remove the `process.env.X ||` fallback** from each config getter. Resolution becomes: **DB setting → hardcoded default.**
4. Remove the migrated keys from `.env.example`, leaving a comment: `# Provider/engine config now lives in Settings (DB), not env.`

### Settings UI must expose all of them
Every migrated key needs a control in `src/app/settings/page.tsx`. `ANTIGRAVITY_BIN` / `CLAUDE_CODE_BIN` are machine-specific filesystem paths — group them under an "Advanced" section with that noted, but they still belong in Settings.

Audit for any config key that is read somewhere but has **no** UI control, and add one. A setting nobody can reach is the same problem as an env var.

---

## Part 2 — Phase 7 hardening

### 1. Graceful degradation
With `CONTENT_ENGINE=higgsfield`, each of these must produce **one clear, actionable message** per variation — never a stack trace:

| Condition | Message |
|---|---|
| Claude CLI binary missing | "Claude Code CLI not found at `<path>`. Set it in Settings → Advanced." |
| `higgsfield-mcp.json` missing | "Higgsfield MCP config not found at `<path>`." |
| MCP not authenticated | "Higgsfield MCP is not authenticated. Run `claude --mcp-config higgsfield-mcp.json --strict-mcp-config`, then `/mcp` to connect." |
| Out of credits | terminal via `isTerminalProviderError` — stops the batch |
| Model not in catalog | "Model `<id>` is not in the Higgsfield catalog. Refresh models in Settings." |

### 2. Consistent logging
Every Higgsfield log line prefixed `[higgsfield]`, matching `[image]` / `[video]` / `[jobs]` / `[Cron]`. Log per generation: model, resolved aspect ratio, resolved duration, media count, and cost preflight.

### 3. Cache integrity (carried from M12 — confirm it landed)
- A `higgsfield_assets` row is written **only after `media_confirm` succeeds**.
- On a generation failure where medias were sent, invalidate those cache rows so the next run re-uploads.

An unconfirmed media_id poisons every future generation for that product, silently and permanently. This already happened once.

### 4. Docs
Add a short **Content Engines** section to `PRODUCT.md` (or the README):
- `buzz` — Remotion/spec compositor. Free, full typographic control, deterministic. **Default.**
- `higgsfield` — generative. Photoreal, uses credits (~2/image, ~4/video), needs the Claude CLI + MCP authenticated.
- The one-time MCP auth step.
- Costs and where to change models.
- **Known limitation:** generative models mangle Arabic/RTL text. For Arabic copy, prefer the `buzz` engine. This is why the feature is switchable rather than a replacement.

### 5. Cosmetic
`hfBalance()` hardcodes `Plan: unknown` instead of parsing the plan from the response. Parse it or drop the field.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
npm run db:push
./node_modules/.bin/tsx scripts/test-higgsfield.ts --cost
```

Then, with the app running:

1. **Regression:** `CONTENT_ENGINE=buzz` (default) — generate an image, confirm `[image]` logs and unchanged behaviour. **This is the critical check.**
2. Clear a config key's DB row, set the matching env var, restart, confirm the seed log and that Settings shows the value.
3. Remove the env var, confirm the setting persists from the DB.
4. Set `CONTENT_ENGINE=higgsfield` with a deliberately wrong `CLAUDE_CODE_BIN`; confirm a clear actionable error, not a stack trace.

Report which checks you ran, with log lines.

**Do not run any real generation.** The single end-to-end Higgsfield UI test is the owner's call.

## Constraints

- **Additive only.** `buzz` engine behaviour must stay byte-for-byte unchanged.
- `./node_modules/.bin/...`, never `npx`.
- New columns nullable; `npm run db:push`, never `db:generate`/`db:migrate`.
- **Do NOT commit.**
- Report lint counts exactly as printed.
