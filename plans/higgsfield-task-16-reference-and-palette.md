# TASK 16 — Wrong reference asset + sand palette (root-caused)

> ## ⛔ RULE 0 — NO ASSET GENERATION
> Free: `tsc`, `lint`, `--balance`, `--cost`, `--models`, `--capabilities`, `--prompt`.
> Balance: **1441.15 credits.**

Two complaints, three root causes, all in Buzz — none in Higgsfield.

---

## Cause 1 — The logo is chosen instead of the screenshots

`buildMediasArray()` slices the **first N** of the `mediaIds` array. The orchestrator builds that array **logo-first**, because review #4 said "prefer the logo if present, otherwise the first screenshot".

Every model in use accepts **max 1** reference. So:

```
[higgsfield] reference: logo (cached) -> b04c5154-…
[higgsfield] model veo3_1_lite accepts max 1 references, using 1 of 5
```

**4 product screenshots are uploaded and never used.** The single slot goes to a wordmark, which is why the output is a phone displaying "TANDA." on a blank screen instead of the app.

**That instruction was wrong and it was mine.** For a software product the screenshot *is* the product; the logo is a wordmark with no UI in it.

### Fix
Order the array **screenshot-first**, logo last:
```
mediaIds = [...screenshotMediaIds, ...(logoMediaId ? [logoMediaId] : [])]
```
Log the choice: `[higgsfield] reference: screenshot 1 of 4 (logo available but deprioritised)`.

Where a model accepts more than one reference (`ms_image` takes 14), send several screenshots and the logo.

Consider a per-product preference later; screenshot-first is the correct default for software.

---

## Cause 2 — The sand/beige palette comes from the product profile

`products.profile.visualIdentity` on product 1 reads:

- **colors:** *"Deep forest green #106f00 on **warm off-white #fcf8f8** in light mode; lime #8eff71 on near-black #0e0e0e in dark…"*
- **mood:** *"Airy, protective, unbothered — **the feeling of shade you didn't have to build**."*

`prompt.ts` injects both into every prompt. The shaper LLM combines "warm off-white", "airy", "shade", and the product name **Tanda** (Arabic for *awning*) and lands on a literal desert/sand scene. Every time. It is doing what it was told.

### Fix
In `prompt.ts`, when building the scene description:

1. **Use colours as colours, not as settings.** Instruct explicitly: *"Apply the brand palette to surfaces, lighting and props. Do NOT translate mood words into literal environments — 'shade', 'airy', 'warm' describe feeling and colour, not a desert, beach, or sand setting."*
2. **Pick the palette that matches the reference.** The screenshots are the **dark theme** (near-black + lime). The prompt currently uses the light-mode colours, so the scene fights the screenshot. When a screenshot is the reference, prefer the dark-mode palette; state the rule rather than leaving it to chance.
3. **Force environment variety across variations.** `CREATIVE_ANGLES` vary composition but not setting. Add an explicit setting axis per angle (desk, café table, kitchen counter, studio seamless, in-hand outdoors) and instruct that consecutive variations must not repeat a setting family.

---

## Cause 3 — The profile was extracted without screenshots and is stale

`profile.visualIdentity.style` literally begins:

> **"ASSUMPTION (no screenshots supplied — derived from the brief's documented design system)"**

The profile was generated from the brief alone. The product now has **4 screenshots**, so the visual identity is guesswork that has never seen the actual UI, and every prompt inherits it.

### Fix
Re-run extraction for product 1 so the profile is derived from the real screenshots — `POST /api/products/[id]/re-extract` already exists. This is a **text-provider** operation and costs no Higgsfield credits.

Then confirm `visualIdentity.style` no longer carries the ASSUMPTION prefix, and that `colors` reflects the dark UI the screenshots actually show.

Also worth checking: extraction has been failing in prod —
```
Extraction failed for product 1: Error: Claude Code CLI exited with code 143
```
That is the same CLI-timeout class we fixed for Higgsfield: the extraction path spawns the Claude CLI **without** `--mcp-config` / `--strict-mcp-config`, so it loads every MCP server and times out. Apply the same isolation and timeout treatment to `src/lib/providers/claude-code.ts`.

---

## Verification (free only)

```
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/tsx scripts/test-higgsfield.ts --prompt 1
```

Pass conditions:
- `--prompt 1` produces three variations with **three visibly different settings**, none of them desert/sand
- prompts reference the **dark** palette when a screenshot is the reference
- the assets log shows a **screenshot** selected, not the logo

Paste the three prompts.

Then deploy with `bash scripts/deploy-prod.sh` and **verify `.next-prod/BUILD_ID` exists and pm2 uptime is fresh** before reporting success.

**Do not run a generation.**

## Constraints

- `./node_modules/.bin/...`, never `npx`.
- Deploy only via `bash scripts/deploy-prod.sh`.
- **Do NOT commit.**
- Report lint counts exactly as printed.
