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

export interface VisionVerdict {
  winner: number;
  notes: string;
  scores: number[];
}

const JUDGE_SYSTEM = `You are a ruthless art director reviewing RENDERED social media images.
You are looking at the actual pixels, not a description. Judge what you see.

Score each image 1-10 on: stopping power, typographic craft, legibility, composition,
and whether the product/subject is respected rather than buried.

Hard failures (score <= 4): text overlapping other text; text unreadable against its
background; the product screenshot or photographic subject obscured by a text block;
type running outside the safe margins.

Then write art-direction notes for the WINNER only — concrete, actionable changes to
its layout, scale, colour, or placement. Do not restate what is already good. Do not
suggest anything that cannot be expressed as position, size, colour, font, uppercase,
or shape placement.

Respond with ONLY this JSON:
{"scores": [<one number per image, in order>], "winner": <0-based index>, "notes": "<notes for the winner>"}`;

function parseVerdict(raw: string, count: number): VisionVerdict | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    try {
      value = JSON.parse(jsonrepair(match[0]));
    } catch {
      return null;
    }
  }
  const v = value as { winner?: unknown; notes?: unknown; scores?: unknown };
  const winner = typeof v.winner === "number" && v.winner >= 0 && v.winner < count ? v.winner : null;
  if (winner === null) return null;
  const scores = Array.isArray(v.scores) ? v.scores.filter((s): s is number => typeof s === "number") : [];
  return { winner, notes: typeof v.notes === "string" ? v.notes : "", scores };
}

// Look at every rendered candidate; return the winner plus notes to revise it.
export async function judgeRenderedImages(
  provider: TextProvider,
  imageUrls: string[],
  context: { productName: string; vibe: string; caption?: string }
): Promise<VisionVerdict> {
  if (imageUrls.length === 1) return { winner: 0, notes: "", scores: [] };

  const userPrompt = `Product: ${context.productName}
Vibe: ${context.vibe}
Caption: ${context.caption ?? ""}

You are shown ${imageUrls.length} candidate images, in order (index 0 first).
Score them all, pick the winner, and give art-direction notes for the winner.`;

  try {
    const res = await provider.generate({ systemPrompt: JUDGE_SYSTEM, userPrompt, images: imageUrls });
    const verdict = parseVerdict(res.text, imageUrls.length);
    if (verdict) {
      console.log(`[image-vision] scores=${JSON.stringify(verdict.scores)} winner=${verdict.winner}`);
      return verdict;
    }
    console.warn("[image-vision] unparseable verdict, defaulting to first candidate");
  } catch (err) {
    console.warn(`[image-vision] judge failed: ${err instanceof Error ? err.message : err}`);
  }
  return { winner: 0, notes: "", scores: [] };
}
