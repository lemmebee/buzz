# TASK 04 — Hotfix: correct endpoints, body shape, and model slugs

**Priority:** Do this BEFORE finishing Task 03.
**Plan:** `plans/higgsfield-engine.md` §3 — updated today with live-API findings.

---

## Context: my plan was wrong, and I've corrected it

Credentials are now configured and I probed the live API directly. Three of my specifications were incorrect. This is my error, not yours — you implemented what the plan said.

**What I got wrong:**

1. **`flux-pro/kontext/max/text-to-image` does not exist.** It 404s. It came from the SDK README; it is not a real endpoint. Only three POST endpoints exist:
   - `/v1/text2image/soul`
   - `/v1/image2video/dop`
   - `/v1/speak/higgsfield`

2. **The request body must be wrapped in `params`.** The API rejects a bare input object:
   ```
   422 {"detail":[{"loc":["body","params"],"msg":"Field required"}]}
   ```
   The v2 SDK passes `input` through as the raw body, so we must nest it ourselves.

3. **M7 was backwards.** I had you delete the Soul branch and standardise on `aspect_ratio`. In fact **Soul is the only text-to-image endpoint that exists**, and it requires `width_and_height`, not `aspect_ratio`. Sorry — please restore that logic. It's now the main path, not a special case.

**Verified required fields** (probed via validation errors, no credits spent):
- `/v1/text2image/soul` → `prompt`, `width_and_height`
- `/v1/image2video/dop` → `prompt`, `input_images`

---

## Architectural correction: endpoint ≠ model

The settings currently conflate the two. There are only three endpoints, and the **model is a slug passed inside `params`**. Separate them:

- Endpoint: **hardcoded** in `client.ts` (there are only three, they won't vary per product)
- Model slug: stays the user-facing setting

Update the defaults in `src/lib/settings.ts`:

| Setting | Old (wrong) | New |
|---|---|---|
| `HIGGSFIELD_IMAGE_MODEL` | `flux-pro/kontext/max/text-to-image` | `higgsfield-ai/soul/standard` |
| `HIGGSFIELD_VIDEO_MODEL` | `/v1/image2video/dop` | `higgsfield-ai/dop/turbo` |

Note the SDK README's `dop-turbo` is **not** a valid slug either — the real value is `higgsfield-ai/dop/turbo`.

---

## Required changes — `src/lib/higgsfield/client.ts`

### 1. `hfGenerateImage`
```ts
const result: V2Response = await client.subscribe("/v1/text2image/soul", {
  input: {
    params: {
      model,                                  // slug from getHiggsfieldImageModel()
      prompt: opts.prompt,
      width_and_height: dimensionsFor(opts.aspectRatio),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
    },
  },
  withPolling: true,
});
```

Add an aspect-ratio → pixel-dimension map (this closes spike S5). Suggested, adjust if the API rejects any:
```
"1:1"  -> "1536x1536"
"9:16" -> "1152x2048"
"4:5"  -> "1536x1920"
"16:9" -> "2048x1152"
```
Default to `1536x1536` for an unrecognised ratio, and warn at `[higgsfield]`.

Drop `safety_tolerance` — it was part of the non-existent flux schema. Do not send fields we haven't verified.

### 2. `hfGenerateVideo`
```ts
const result: V2Response = await client.subscribe("/v1/image2video/dop", {
  input: {
    params: {
      model,                                  // slug from getHiggsfieldVideoModel()
      prompt: opts.prompt,
      input_images: [{ type: "image_url", image_url: opts.startImageUrl }],
    },
  },
  withPolling: true,
});
```

### 3. Model catalog helper (small, useful)
```ts
export async function hfListModels(): Promise<Array<{
  slug: string; title: string; operation_type: string;
  output_type: string; base_credits: string;
}>>
```
`GET https://platform.higgsfield.ai/models` with header `Authorization: Key ${credentials}`. Returns `{ total, items }` — return `items`.

This backs the Phase 6 settings dropdown and lets us surface credit costs. Note `GET /v1/models` returns 405; the correct path has **no** `/v1` prefix.

### 4. Extend the spike script
Add a `--models` mode that prints the catalog as a table (slug, type, credits). This works on **zero credits**, so it's our smoke test that credentials and connectivity are healthy.

---

## Also outstanding from Task 02 (still not done)

- **S5** — `assets.ts:~88`, unguarded `JSON.parse(product.screenshots)` outside any try.
- **S6** — `assets.ts:51`, `slice(lastIndexOf("."))` returns the last character when there's no dot.

---

## Verification (paste literal output)

```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-higgsfield.ts --models
```

`--models` must print 13 models. That proves the endpoint, auth, and header format end to end.

**Do not expect generation to succeed yet.** The account currently has zero credits — a correctly-formed request returns `403 {"detail":"Not enough credits"}`. **A 403 with that message is a PASS for this task**: it proves the endpoint and body shape are right. A 422 or 404 is a fail.

Reminder: `tsc` takes ~27s and the scripts ~30s here. That is normal, not a hang.

---

## Hard constraints

- Additive only. Do not touch `src/lib/generate.ts` (Phase 6) or the Remotion/spec pipeline.
- Do not send request fields that haven't been verified against the live API.
- **Do NOT commit.**
- If the API rejects any dimension string in the map above, report the exact error rather than guessing another value.

## Report back with

1. Files modified
2. Literal output of the three commands
3. The `--models` table
4. Confirmation that S5 and S6 are done
