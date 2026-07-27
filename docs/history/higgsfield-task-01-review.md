# TASK 01 — CTO Review

**Verdict:** Changes requested. 3 must-fix, 4 should-fix. Do not proceed to Phase 2 until the must-fix items land.

Good work overall — the structure is right, the scope was respected, and you caught a real error in my plan.

---

## Verified

I checked your three claims independently:

- **S2 (v1 vs v2 upload) — CONFIRMED.** `dist/v2/client.d.ts` exposes exactly `subscribe()` and `configure()`. No upload. Your two-client approach is correct.
- **V2Response shape — CONFIRMED, and you were right that my plan was wrong.** `dist/v2/types.d.ts:71` is `{ status, request_id, status_url, cancel_url, images?: V2Image[], video?: V2Video }`. The README's "converts into a JobSet" text does not match the shipped types. Good catch — I've noted it.
- **Lint baseline — CONFIRMED.** I stashed your changes and ran lint on clean HEAD: 3 errors + 1 warning in `ecosystem.config.js` and `settings/page.tsx`. Identical. You introduced none.

---

## MUST FIX

### M1 — `hfGenerateVideo` fabricates the duration
`src/lib/higgsfield/client.ts:144`

```ts
return { ...saved, duration: opts.duration ?? 5 };
```

Two defects in one line:

1. **`opts.duration` is never sent to the API.** Check `dist/v2/types.d.ts:1-14` — `DoPImage2VideoInput` is `{ model, prompt, input_images, motions?, seed?, enhance_prompt? }`. There is **no `duration` field**. Your `input` object silently drops it.
2. **`?? 5` invents a number.** `V2Response` carries no duration either. This fabricated value flows into `GeneratedPost.duration` → `content.duration` in the DB. We'd be storing a fiction.

**Fix:** drop the `duration` param from the signature entirely, and derive the real duration from the downloaded file using `ffmpeg-static` (already a dependency — see how `src/lib/video/compose.ts` invokes it). If probing is awkward, return `duration: null` and let Phase 5 handle it. **Never return a guessed number.**

This also resolves spike **S6**: `/v1/image2video/dop` does not accept a duration parameter. Record that in `plans/higgsfield-engine.md` §4.

### M2 — 5-minute poll timeout will kill video jobs
`src/lib/higgsfield/client.ts:45`

`maxPollTime: 300000` is the SDK default and you share one cached client for both image and video. Plan risk **R3** called this out explicitly: video generation routinely exceeds 5 minutes.

**Fix:** use a longer `maxPollTime` for video (start at 15 min). Either keep two configured clients, or call `client.configure()` per call type. Buzz's job processing is already detached from the HTTP request (`/api/jobs/process` deliberately doesn't await), so a long server-side wait is safe.

### M3 — Don't import the Higgsfield SDK into core error handling
`src/lib/providers/errors.ts:1-6`

You added a **static top-level import** of `@higgsfield/client` (which pulls `axios` + `form-data`). `errors.ts` is imported by the orchestrators and API routes on the **default `buzz` engine path**. That means every Buzz install now loads the Higgsfield SDK even when the engine is never used — and a broken SDK install would break core error classification.

This violates the additive constraint: the default path must be untouched. Note how `src/lib/generate.ts` uses lazy `await import()` for exactly this reason.

**Fix:** don't import the classes. Match on `err.name` / constructor name instead:

```ts
const name = err instanceof Error ? err.constructor?.name : "";
if (name === "AuthenticationError") { ... }
```

Keep the string/regex fallbacks you already added — they're good.

---

## SHOULD FIX

### S1 — Cached client holds stale credentials
`client.ts:18-19, 37-49`. The module-level singleton is built once. If the user updates `HIGGSFIELD_CREDENTIALS` in Settings, the old credentials persist until a server restart — confusing, and it'll read as "my new key doesn't work."

The SDK exports `reset()` from `@higgsfield/client/v2`. Either cache keyed by the credential string, or don't cache at all (Buzz's other providers are constructed per-call via `factory.ts` — match that).

### S2 — `parseCredentials` breaks on secrets containing `:`
`client.ts:29-35`. `split(":")` with a `length !== 2` guard throws if the secret contains a colon. Split on the **first** colon only:
```ts
const i = creds.indexOf(":");
```

### S3 — `aspect_ratio` is flux-specific but the model is configurable
`client.ts:94` hardcodes `aspect_ratio`, while `HIGGSFIELD_IMAGE_MODEL` is a user-facing setting. Per `dist/v2/types.d.ts:29-44`, `SoulText2ImageInput` takes **`width_and_height` + `quality` + `batch_size`** — no `aspect_ratio` at all.

If anyone sets the model to `/v1/text2image/soul`, this silently sends the wrong parameters. Either constrain the setting to flux-family endpoints for now (with a comment), or branch input construction per endpoint.

### S4 — Hardcoded `.jpg` / `.mp4` extensions
`client.ts:112,143`. Derive the extension from the download's `content-type` header. The media route sets content-type from the file extension, so a PNG saved as `.jpg` gets mislabeled on the way out.

---

## Bonus: findings from the SDK types for your next phase

Dug these out of `dist/v2/types.d.ts` — they answer open spikes:

- **DoP models:** `'dop-lite' | 'dop-turbo' | 'dop-standard'` (you hardcoded `dop-turbo`; make it a setting later).
- **DoP also supports `motions?: [{id, strength}]`** — the named camera-motion presets. Strong lever for video quality in Phase 5.
- **Both DoP and Soul support `enhance_prompt?: boolean`** — HF-side prompt enhancement. Worth testing, given this engine's whole premise is "HF does the creative."
- **`EndpointInputMap` only types 3 endpoints** (`dop`, `speak`, `soul`) — `flux-pro/...` is untyped, and `subscribe` accepts `SubscribeOptions<any>`, so **there is no compile-time safety on the input object.** Be deliberate; tsc will not catch a wrong field name.
- **`ModelSchema` / `ModelSchemasResponse` / `schema-loader.ts` exist** — the SDK can fetch the model catalog at runtime. That may resolve spike **S3** (model catalog) without needing docs. Worth a look when credentials land.

---

## Next

1. Land M1–M3, then S1–S4.
2. Re-run `npm run lint`, `npx tsc --noEmit`, `npx tsx scripts/test-higgsfield.ts`.
3. Update `plans/higgsfield-engine.md` §4 with the S6 answer (no duration param) and the V2Response correction.
4. Report back. Task 02 (Phase 2 — asset upload + cache) is drafted and waits on this.

Still do not commit. Leave everything in the working tree.
