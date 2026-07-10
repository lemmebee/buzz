import { jsonrepair } from "jsonrepair";
import { createClaudeCodeTextProvider } from "@/lib/providers/claude-code";
import type { TextProvider } from "@/lib/providers/types";

// Judging a rendered image requires a provider that can actually see. The
// default Antigravity model (GPT-OSS 120B) is text-only, and a blind judge
// silently invents critique rather than erroring — worse than no judge at all.
// So the vision judge resolves independently of the authoring provider.
export function resolveVisionProvider(): TextProvider {
  const bin = process.env.VISION_PROVIDER_BIN;
  const model = process.env.VISION_PROVIDER_MODEL || "sonnet";
  return createClaudeCodeTextProvider({ baseUrl: bin, model });
}

// ─── Why pairwise, and why both orders ───────────────────────────────────────
// Absolute 1-10 scoring is the least reliable judging mode: the same rendered
// image scored 6 and then 4 across two identical calls. Pairwise comparison is
// measurably more robust, but every judging mode carries position bias — a
// preference for whichever candidate is shown first. So each comparison runs
// twice with the order swapped, and only an order-independent verdict counts.
// Disagreement between the two orders IS the signal that it's a coin flip.
//   https://arxiv.org/abs/2406.07791  (position bias in pairwise LLM judging)

function parseJson(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    try {
      return JSON.parse(jsonrepair(match[0]));
    } catch {
      return null;
    }
  }
}

// Boldness is a first-class criterion, not a footnote.
//
// The previous prompt listed four "automatic losers" — all of them safety
// failures — and mentioned stopping power once. Measured against a safe centered
// layout and a bold oversized one (both defect-free), it returned TIE in both
// orders: it could not tell them apart, so position bias decided, and ties go to
// the incumbent. Blandness was literally unpunished. The renderer now makes
// overlap and margin violations structurally impossible, so the disqualifiers
// below are a safety net for photographic cases — they must not be the whole
// rubric, or the judge selects the mean of the candidate pool every time.
const COMPARE_SYSTEM = `You are a ruthless art director comparing two RENDERED social media images.
You are looking at actual pixels, not descriptions. This is an ad. It has one job:
stop a thumb.

STEP 1 — DISQUALIFY only for real defects:
  • text physically overlapping other text
  • text genuinely unreadable against what is behind it
  • the product screenshot or photographic subject buried under a text block
  • type spilling outside the safe margins
If exactly one image has a defect, the other wins. If both do, pick the lesser.

STEP 2 — If BOTH are defect-free (the usual case), judge on distinctiveness:
  • Stopping power. Which one makes you stop? Scale contrast, a real focal point,
    tension, an idea.
  • Typographic craft. Deliberate hierarchy, tight display tracking, confident scale.
  • Composition. Asymmetry, negative space used on purpose, a considered crop.
  • Specificity. Apply this test: "Could this image belong to ANY other product
    if I swapped the words?" If yes, it is generic and it LOSES.

A safe, centred, evenly-weighted, forgettable design LOSES to a braver one that
takes a real compositional risk — provided the brave one has no defect from STEP 1.
Timidity is a failure mode, not a virtue. Do not reward an image merely for being
inoffensive.

Pick a winner. Only call it a draw if the two are genuinely indistinguishable —
never to avoid making a judgment.

The first image is A, the second is B. Respond with ONLY: {"winner": "A"|"B", "why": "<one line>"}`;

// A single A/B comparison. Returns 0 for the first url, 1 for the second, null on failure.
async function compareOnce(
  provider: TextProvider,
  urlA: string,
  urlB: string,
  context: JudgeContext
): Promise<0 | 1 | null> {
  const userPrompt = `Product: ${context.productName}
Vibe: ${context.vibe}
Caption: ${context.caption ?? ""}

Image A is shown first, image B second. Which is the better post?`;
  try {
    const res = await provider.generate({
      systemPrompt: COMPARE_SYSTEM,
      userPrompt,
      images: [urlA, urlB],
    });
    const v = parseJson(res.text) as { winner?: unknown } | null;
    if (v?.winner === "A") return 0;
    if (v?.winner === "B") return 1;
    return null;
  } catch (err) {
    console.warn(`[image-vision] compare failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export type PairResult = "first" | "second" | "tie";

// Compare in both orders. Only an order-independent winner is a winner.
export async function comparePair(
  provider: TextProvider,
  first: string,
  second: string,
  context: JudgeContext
): Promise<PairResult> {
  const forward = await compareOnce(provider, first, second, context);
  const reverse = await compareOnce(provider, second, first, context);
  if (forward === null || reverse === null) return "tie";

  // forward: 0 => first wins.  reverse: 1 => first wins (it was shown second).
  const firstWins = forward === 0 && reverse === 1;
  const secondWins = forward === 1 && reverse === 0;
  if (firstWins) return "first";
  if (secondWins) return "second";
  return "tie"; // the two orders disagreed: position bias, not a real preference
}

export interface JudgeContext {
  productName: string;
  vibe: string;
  caption?: string;
}

// Round-robin, not single-elimination. Judge verdicts are frequently
// non-transitive (A beats B, B beats C, C beats A), so a bracket can crown a
// candidate that loses head-to-head against one it never met. With N=3 this is
// three pairs instead of two — cheap insurance.
//   https://arxiv.org/abs/2502.14074  (non-transitivity in LLM-as-a-judge)
//
// Only order-invariant wins score. Ties score nothing for either side, and a
// tie on every pair leaves candidate 0 the winner by index.
export interface PickResult {
  winner: number;
  // false when every pair tied (the judge could not tell the candidates apart) —
  // the caller then breaks the tie itself rather than always defaulting to
  // candidate 0, which would ship the same design on every generation.
  decisive: boolean;
}

export async function pickWinner(
  provider: TextProvider,
  urls: string[],
  context: JudgeContext
): Promise<PickResult> {
  if (urls.length < 2) return { winner: 0, decisive: true };

  const wins = new Array<number>(urls.length).fill(0);
  let anyDecision = false;
  for (let i = 0; i < urls.length; i++) {
    for (let j = i + 1; j < urls.length; j++) {
      const result = await comparePair(provider, urls[i], urls[j], context);
      if (result === "first") { wins[i]++; anyDecision = true; }
      else if (result === "second") { wins[j]++; anyDecision = true; }
      console.log(`[image-vision] ${i} vs ${j}: ${result}`);
    }
  }

  let best = 0;
  for (let i = 1; i < urls.length; i++) if (wins[i] > wins[best]) best = i;
  console.log(`[image-vision] wins=${JSON.stringify(wins)} winner=${best} decisive=${anyDecision}`);
  return { winner: best, decisive: anyDecision };
}

const CRITIQUE_SYSTEM = `You are a ruthless art director reviewing ONE rendered social media image.
You are looking at actual pixels. This is an ad; its job is to stop a thumb.

Apply the specificity test first: "Could this image belong to ANY other product if I
swapped the words?" If yes, say so and make it specific.

Write concrete, actionable art-direction notes that make the piece BOLDER and more
distinctive — push scale contrast, asymmetry, a single focal point, a considered crop,
one word carrying the accent. Never advise making it safer, more centred, or more
evenly balanced. "Inoffensive" is not the goal.

Every note must be expressible in the spec vocabulary: archetype, alignment, position,
size, colour, font, uppercase, or a relational decor mark. Do not restate what already
works. Do not invent capabilities the renderer does not have.

Respond with ONLY: {"notes": "<the notes>"}`;

// Notes are qualitative, so pointwise is fine here — we never compare them.
export async function critique(
  provider: TextProvider,
  url: string,
  context: JudgeContext
): Promise<string> {
  try {
    const res = await provider.generate({
      systemPrompt: CRITIQUE_SYSTEM,
      userPrompt: `Product: ${context.productName}\nVibe: ${context.vibe}\nCaption: ${context.caption ?? ""}`,
      images: [url],
    });
    const v = parseJson(res.text) as { notes?: unknown } | null;
    return typeof v?.notes === "string" ? v.notes : "";
  } catch (err) {
    console.warn(`[image-vision] critique failed: ${err instanceof Error ? err.message : err}`);
    return "";
  }
}
