import type { TextProvider } from "@/lib/providers/types";
import {
  authorImageVariants,
  deterministicImageSpec,
  reviseImageSpec,
  type ImageAuthorInput,
} from "./spec-author";
import { renderSpecImage, type RenderImageOpts, type RenderImageResult } from "./render-spec";
import { comparePair, critique, pickWinner, resolveVisionProvider } from "./vision-judge";

export interface SelectImageInput extends ImageAuthorInput {
  textProvider: TextProvider;
  renderOpts: RenderImageOpts;
  n?: number;
  fallbackPalette?: { bg: string; accent: string; text: string };
}

const visionEnabled = () => process.env.IMAGE_VISION_LOOP !== "0";

// Author N candidates, RENDER all of them, and let a judge look at the pixels.
//
// The previous flow judged a four-field JSON summary of each spec and rendered
// only the winner, so nothing in the pipeline ever saw an image. Colliding
// glyphs and buried subjects are invisible in a spec summary.
export async function renderBestImage(input: SelectImageInput): Promise<RenderImageResult> {
  const n = Math.max(1, input.n ?? 3);
  // One cache across every render: candidates share a background, so the judge
  // compares layouts, and the winner's re-render reuses its own photo.
  const bgCache = input.renderOpts.bgCache ?? new Map<string, string>();
  const renderOpts: RenderImageOpts = { ...input.renderOpts, bgCache };

  const specs = await authorImageVariants(input.textProvider, input, n);
  if (specs.length === 0) {
    console.warn("[image-vision] no valid specs; using deterministic fallback");
    return renderSpecImage(deterministicImageSpec(input), renderOpts);
  }

  if (!visionEnabled()) return renderSpecImage(specs[0], renderOpts);

  // Render every candidate. Sequential: renderStill drives a headless browser,
  // and parallel Chrome instances contend for the same bundle and CPU.
  const rendered: RenderImageResult[] = [];
  for (const spec of specs) {
    rendered.push(await renderSpecImage(spec, renderOpts));
  }
  console.log(`[image-vision] rendered ${rendered.length} candidate(s)`);

  const vision = resolveVisionProvider();
  const context = { productName: input.productName, vibe: input.vibe, caption: input.caption };

  const winner = await pickWinner(vision, rendered.map((r) => r.url), context);
  const winnerSpec = specs[winner];
  const winnerRender = rendered[winner];

  const notes = await critique(vision, winnerRender.url, context);
  if (!notes.trim()) return winnerRender;

  const revisedSpec = await reviseImageSpec(input.textProvider, input, winnerSpec, notes);
  if (revisedSpec === winnerSpec) return winnerRender;

  // The revision must beat the original in BOTH presentation orders. A tie means
  // the two orders disagreed, which is position bias rather than an improvement —
  // so we keep what we already had. Revisions must earn their place.
  const revisedRender = await renderSpecImage(revisedSpec, renderOpts);
  const verdict = await comparePair(vision, winnerRender.url, revisedRender.url, context);
  console.log(`[image-vision] revision ${verdict === "second" ? "accepted" : `rejected (${verdict})`}`);
  return verdict === "second" ? revisedRender : winnerRender;
}
