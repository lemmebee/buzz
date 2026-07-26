# TASK 05 — Swap transport: Claude Code CLI + Higgsfield MCP (replaces the REST SDK)

**Supersedes:** Task 04 (endpoint hotfix). **Do not implement Task 04** — the REST API path is abandoned.
**Plan:** `plans/higgsfield-engine.md` — §3 (endpoints) is now historical; this task defines the transport.

---

## Decision and why

The REST API (`platform.higgsfield.ai`) bills from a **separate, empty wallet**. The user's 1,615 credits live on the **Plus subscription**, which the REST API cannot spend.

The Higgsfield **MCP** *can* spend them, and Buzz already spawns the Claude Code CLI for text generation (`src/lib/providers/claude-code.ts`). So we reach Higgsfield through the CLI instead of over HTTP.

**All of this is verified on this machine, not assumed:**

```
$ claude --print --allowedTools 'mcp__claude_ai_HiggsField__balance'
Credits: 1615.15
Subscription plan: plus
```

```
$ claude --print --allowedTools 'mcp__claude_ai_HiggsField__generate_image'
  (params: model=marketing_studio_image, get_cost=true)
{"cost":{"credits":2,"credits_exact":2},
 "adjustments":{"params.resolution":{"used":"1k","reason":"default for model"}}}
```

Headless CLI → MCP → Higgsfield → structured JSON, working, at zero credit cost.

**Budget:** ~2 credits per marketing image. 1,615 credits ≈ **800 images**. Cost is no longer a constraint.

### What does NOT change

Phases 1–3 survive. `context.ts`, `prompt.ts`, `assets.ts`, orchestration, engine switching, settings — all unaffected. **Only the transport underneath `client.ts` changes.** Keep the exported function signatures stable so Phases 4–6 never learn which transport is in use.

---

## Bonus: the MCP surface is richer than the REST API

Worth knowing before you design the calls:

- **`marketing_studio_image` / `marketing_studio_video`** exist here — one-click product/ad generation, the documented default for "commercial/product/ads". That is precisely Buzz's use case. Make these the defaults.
- **Video supports `duration`, `aspect_ratio`, `count`** — the raw DoP endpoint accepted none of these.
- **`get_cost: true`** preflights credits without generating. Use it.
- **`count`** (1–4) can produce variations in a single call.
- Far more models than the six the REST catalog exposed (`soul_2`, `nano_banana_pro`, `seedance_2_0`, `kling3_0`, …).

---

## Work

### 1. Rewrite `src/lib/higgsfield/client.ts` transport

Drop `@higgsfield/client` usage. Spawn the CLI instead, modelled on `claude-code.ts:33-65` (`spawn`, stdin-piped prompt, stdout collected, timeout, non-zero exit → reject).

Keep these signatures **unchanged**:
```ts
hfGenerateImage(opts: { prompt: string; aspectRatio: string; seed?: number }): Promise<{ url: string; localPath: string }>
hfGenerateVideo(opts: { prompt: string; startImageUrl: string }): Promise<{ url: string; localPath: string; duration: number | null }>
```

Add:
```ts
hfGetCost(kind: "image" | "video", params: Record<string, unknown>): Promise<number>
hfBalance(): Promise<{ credits: number; plan: string }>
```

Invocation shape:
```
spawn(bin, ["--print", "--model", <cheap model>, "--allowedTools", "mcp__claude_ai_HiggsField__generate_image"])
```
- `bin` resolution must match `claude-code.ts`: `config.baseUrl || process.env.CLAUDE_CODE_BIN || "/home/mrg/.local/bin/claude"`.
- Prompt goes via **stdin**, not argv (`--print` with an argv prompt errored in testing; stdin works).
- **Always** pass `--allowedTools` scoped to the single tool needed. Never let it run unrestricted.
- Timeout: 5 min images, 15 min video (generation is slow).

### 2. Structured output — do not free-text parse

Instruct the CLI to emit **one line of strict JSON and nothing else**, then parse it. Use `jsonrepair` (already a dependency) for tolerance, exactly as the existing prompt parsers do.

Target shape:
```json
{"status":"ok","url":"https://...","credits":2}
{"status":"error","message":"..."}
```

Treat a missing/unparseable line as a provider error via `classifyProviderError`. **Do not regex a URL out of prose** — that will rot.

### 3. Download to `public/media`

`downloadToMedia()` already exists and is correct — keep it. The MCP returns a remote URL; download the bytes and return the `/api/media/...` form, same as today.

### 4. Rework `hfUpload` in `assets.ts` — different mechanism

The MCP does **not** accept `https://` URLs as reference media. Per the tool schema:

> `medias[].value` must be a **media_id** (from `media_upload` / `media_import_url`) or a prior **job_id** — *not* a URL.

So Phase 2's cache must store a **media_id**, not a CDN URL. Changes:
- `hfUpload` → spawn CLI with `mcp__claude_ai_HiggsField__media_upload`, return the `media_id`.
- The `higgsfield_assets.hf_url` column now holds a media_id. **Rename it to `hf_media_id`** (nullable add + `npm run db:push`; do not attempt a destructive migration).
- Update `ensureProductAssetsUploaded`'s return type and its callers.

### 5. Model settings

Update defaults in `src/lib/settings.ts`:

| Setting | New default |
|---|---|
| `HIGGSFIELD_IMAGE_MODEL` | `marketing_studio_image` |
| `HIGGSFIELD_VIDEO_MODEL` | `marketing_studio_video` |

### 6. Remove the dead REST path

Delete SDK-specific code from `client.ts` (v1/v2 clients, `parseCredentials`, `HIGGSFIELD_CREDENTIALS` plumbing) **only where it is now unreachable**.

Keep `@higgsfield/client` in `package.json` for now — removing it is a separate cleanup.

`errors.ts` still matches on `err.constructor.name`; leave it, and add matching for CLI failure modes (non-zero exit, timeout, tool-not-allowed).

### 7. Preconditions and failure modes

The CLI must exist and be authenticated. Fail with a **clear, actionable** message — not a stack trace:
- binary missing → "Claude Code CLI not found at <path>. Set CLAUDE_CODE_BIN."
- Higgsfield MCP unavailable → "Higgsfield MCP not available to the Claude Code CLI. Run `claude` and connect the Higgsfield integration."
- insufficient credits → terminal via `isTerminalProviderError`.

### 8. Extend `scripts/test-higgsfield.ts`

Replace `--models` with:
- `--balance` → prints credits + plan (free)
- `--cost` → `get_cost` preflight for a sample image and video (free)
- default generate mode → real image, then image-to-video from it (**spends ~2 credits**; print the cost before running)

---

## Also still outstanding from Task 02

- **S5** — `assets.ts:~88`, unguarded `JSON.parse(product.screenshots)` sitting outside any try.
- **S6** — `assets.ts:51`, `slice(lastIndexOf("."))` returns the last character when there is no dot.

---

## Verification (paste literal output)

```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-higgsfield.ts --balance
npx tsx scripts/test-higgsfield.ts --cost
```

`--balance` must print ~1615 credits, plan `plus`. `--cost` must print credit counts for image and video. **Both are free** — full transport verification without spending anything.

Only run the generate mode once the above pass, and report the credits consumed.

Note: `tsc` ~27s, scripts ~30s, CLI spawns 10–60s. Normal, not hangs.

---

## Hard constraints

- Additive only. Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion/spec pipeline.
- Do not change the exported signatures of `hfGenerateImage` / `hfGenerateVideo` — Phases 4–6 depend on them.
- Always scope `--allowedTools`. Never spawn the CLI unrestricted.
- **Do NOT commit.**
- If an MCP tool returns a shape different from the above, **report the actual shape** rather than coercing it.

## Report back with

1. Files modified
2. Literal output of all four commands
3. The exact JSON shape the MCP returned for image generation
4. Confirmation that S5 and S6 are done
