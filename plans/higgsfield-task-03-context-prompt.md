# TASK 02 — APPROVED ✅ / TASK 03 — Phase 3: Context Assembler + Prompt Shaper

**Plan:** `plans/higgsfield-engine.md` (authoritative spec)
**Scope:** Phase 3 + two carry-over fixes. Do not start Phases 4–7.

---

## Part 1 — Task 02 sign-off

M8 verified on your tree:

| Check | Result |
|---|---|
| `isTerminalProviderError(err)` → re-throw | ✅ correct, and you reused the existing helper rather than inventing a second rule |
| `npx tsc --noEmit` | exit 0 ✅ |
| `npm run lint` | 0 errors, 1 pre-existing warning ✅ |
| `--assets 1` fails loudly on missing creds | ✅ confirmed |

**Task 02 is accepted.** The silent-degradation hole is closed.

Verification report was accurate this round. Keep that.

### Carry-over — S5 and S6 were not done and not mentioned

Both were in the review's "SHOULD FIX" section. They're small, so I'm folding them into this task rather than spending a round-trip — but flag items you're skipping rather than leaving them silent. "Not doing S5/S6 this round" is a fine answer; omitting them is not.

**S5 —** `assets.ts:~88`, `JSON.parse(product.screenshots)` is still unguarded and still sits outside any try. Malformed JSON throws and discards an already-successful logo upload. Wrap it, fall back to `[]`, warn at `[higgsfield]`.

**S6 —** `assets.ts:51`, `localPath.slice(localPath.lastIndexOf("."))`. With no dot, `lastIndexOf` returns `-1` and `slice(-1)` returns the last character as the "extension". Guard the `-1` case explicitly.

---

## Part 2 — Task 03 assignment

Implement **Phase 3** from `plans/higgsfield-engine.md` §5: the context assembler and the prompt shaper.

This is the heart of the feature. Everything Buzz knows about a product gets gathered here and distilled into one instruction for Higgsfield. **Buzz's only remaining job in this engine is to write a good prompt** — there is no compositor, no spec, no creative direction downstream.

**No credentials required.** This phase is fully buildable and verifiable without a Higgsfield account.

### 1. `src/lib/higgsfield/context.ts`

```ts
export interface HiggsfieldContext {
  name: string;
  description: string;
  planFile?: string | null;
  profile?: ProductProfile | null;
  marketingStrategy?: MarketingStrategy | null;
  icp?: unknown;
  jtbd?: unknown;
  channelHints?: string[] | null;
  llmInstructions?: string | null;
  brainstormIdeas: BrainstormIdeaRow[];
  instagramHandle?: string | null;
  targetSurface: ContentPurpose;
  mediaType: MediaType;
  config: ContentConfig;
  targeting?: ContentTargeting;
  logoUrl?: string;
  screenshotUrls: string[];
}

export async function gatherContext(input): Promise<HiggsfieldContext>
```

Sources (all already exist — do not invent new ones):
- `products` row: `name`, `description`, `planFile`, `profile` (JSON `ProductProfile`), `marketingStrategy` (JSON `MarketingStrategy`), `icp`, `jtbd`, `channelHints`, `llmInstructions`
- `brainstorm_ideas` rows for the product
- Instagram handle: join `products.instagramAccountId` → `instagram_accounts.username`
- Asset CDN URLs: call `ensureProductAssetsUploaded(productId)` from Phase 2

`profile` and `marketingStrategy` are stored as JSON strings — parse defensively (same lesson as S5; malformed JSON must not take down generation).

### 2. `src/lib/higgsfield/prompt.ts`

```ts
export async function buildHiggsfieldPrompt(
  ctx: HiggsfieldContext,
  variationIndex: number
): Promise<{ imagePrompt: string; motionPrompt: string; caption: string; hashtags: string[] }>
```

Requirements:

- **Exactly one** `TextProvider` call. Resolve it with `resolveTextProvider(product.textProvider)` from `src/lib/providers/factory.ts`.
- Ask for strict JSON. Parse with **`jsonrepair`** (already a dependency) — follow how the existing parsers in `src/lib/brain/prompts.ts` do it.
- Run the caption through **`sanitizeCaption()`** from `src/lib/generate.ts`. Do not reimplement it.
- Include skill packs when `skillsEnabled()` — use `composeSkillSection()` from `src/lib/skills/`.
- Thread `llmInstructions` through, matching how the existing prompt builders honour it.
- **`variationIndex` must produce genuinely different output.** Instruct a distinct creative angle per index. If `count=3` returns three near-identical prompts, this phase has failed its main job.
- **Truncate long inputs before sending** — `planFile` especially can be a large markdown document. Distill, don't dump. Pick a sane cap and note it in a comment.
- `motionPrompt` describes camera/subject motion for the Phase 5 image-to-video step. Keep it short and concrete.

**This is translation, not creative direction.** Do not add judging, scoring, multi-candidate comparison, or revise loops — that's precisely the machinery this engine exists to bypass.

### 3. Extend `scripts/test-higgsfield.ts`

Add a `--prompt <productId>` mode that calls `gatherContext` then `buildHiggsfieldPrompt` and **prints the assembled prompt, caption, and hashtags without calling Higgsfield.**

This is the phase's proof: run it for `variationIndex` 0, 1, and 2 and show the three prompts differ meaningfully.

---

## Verification (paste literal output)

```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-higgsfield.ts --prompt 1
```

The `--prompt` mode needs a **text** provider (Gemini etc.), not Higgsfield credentials — so this phase is fully provable now. Show the three variation prompts side by side.

Note: `tsc` takes ~27s and the scripts ~30s on this project. That is normal. Do not report it as a hang.

---

## Hard constraints

- **Additive only.** Do not modify the spec/Remotion/creative-director pipeline. Do not touch `src/lib/generate.ts` — engine wiring is Phase 6.
- Do not fix `src/lib/images.ts`.
- Reuse existing helpers (`sanitizeCaption`, `resolveTextProvider`, `composeSkillSection`, `jsonrepair`) rather than writing parallel versions.
- TypeScript strict. Match surrounding style. No speculative abstractions.
- **Do NOT commit.**
- If the plan conflicts with the code, **STOP and report** rather than guessing.

## Report back with

1. Files created/modified
2. **Literal pasted output** of all three commands
3. The three variation prompts, so I can judge whether they're genuinely distinct
4. Confirmation that S5 and S6 are done
5. Anything in the plan that looks wrong
