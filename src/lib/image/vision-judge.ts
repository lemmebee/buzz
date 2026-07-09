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

const COMPARE_SYSTEM = `You are a ruthless art director comparing two RENDERED social media images.
You are looking at actual pixels, not descriptions.

Judge on: stopping power, typographic craft, legibility, composition, and whether the
product or photographic subject is respected rather than buried.

Automatic loser: text overlapping other text; text unreadable against its background;
the subject obscured by a text block; type outside the safe margins.

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
export async function pickWinner(
  provider: TextProvider,
  urls: string[],
  context: JudgeContext
): Promise<number> {
  if (urls.length < 2) return 0;

  const wins = new Array<number>(urls.length).fill(0);
  for (let i = 0; i < urls.length; i++) {
    for (let j = i + 1; j < urls.length; j++) {
      const result = await comparePair(provider, urls[i], urls[j], context);
      if (result === "first") wins[i]++;
      else if (result === "second") wins[j]++;
      console.log(`[image-vision] ${i} vs ${j}: ${result}`);
    }
  }

  let best = 0;
  for (let i = 1; i < urls.length; i++) if (wins[i] > wins[best]) best = i;
  console.log(`[image-vision] wins=${JSON.stringify(wins)} winner=${best}`);
  return best;
}

const CRITIQUE_SYSTEM = `You are a ruthless art director reviewing ONE rendered social media image.
You are looking at actual pixels. Write concrete, actionable art-direction notes: changes to
layout, scale, colour, or placement. Do not restate what already works. Do not suggest anything
that cannot be expressed as position, size, colour, font, uppercase, or shape placement.

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
