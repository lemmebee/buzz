import type { TextProvider } from "@/lib/providers/types";
import { pickWinner, resolveVisionProvider } from "@/lib/image/vision-judge";
import { authorVideoVariants, buildFallbackSpec, type AuthorInput } from "./spec-author";
import { renderSpecVideo, type RenderSpecResult } from "./render-spec";
import { renderPreviewSheet } from "./preview";

export interface SelectVideoInput extends AuthorInput {
  textProvider: TextProvider;
  n?: number;
  fallbackPalette?: { bg: string; accent: string; text: string };
  productShotPaths: string[]; // staticFile-relative product screenshots for render + preview
  imageProviderName?: string | null;
}

const visionEnabled = () => process.env.VIDEO_VISION_LOOP !== "0";

// Author N variants, render a CHEAP contact-sheet preview of each, and let the
// pairwise vision judge pick the winner from the frames — not from a four-field
// JSON summary that can't see a colliding hero or a buried screenshot. Only the
// winner pays for a full render (TTS + real backgrounds + whisper + encode).
export async function renderBestVideo(input: SelectVideoInput): Promise<RenderSpecResult & { source: string; valid: number }> {
  const n = Math.max(1, input.n ?? 3);
  const renderOpts = { imageProviderName: input.imageProviderName, productShots: input.productShotPaths };

  const specs = await authorVideoVariants(input.textProvider, input, n);
  console.log(`[video-select] authored ${specs.length}/${n} valid variant(s)`);

  if (specs.length === 0) {
    const fallback = buildFallbackSpec({
      script: input.script?.trim() || input.productName,
      palette: input.fallbackPalette ?? { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" },
      aspectRatio: input.aspectRatio,
      durationSec: input.durationSec,
    });
    return { ...(await renderSpecVideo(fallback, renderOpts)), source: "deterministic", valid: 0 };
  }

  if (specs.length === 1 || !visionEnabled()) {
    return { ...(await renderSpecVideo(specs[0], renderOpts)), source: "single", valid: specs.length };
  }

  // Cheap previews, sequentially (each drives headless Chrome).
  const sheets: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    sheets.push(await renderPreviewSheet(specs[i], { productShots: input.productShotPaths, label: String(i) }));
  }

  const vision = resolveVisionProvider();
  const winner = await pickWinner(vision, sheets, {
    productName: input.productName,
    vibe: input.vibe,
    caption: input.script,
  });
  console.log(`[video-select] pixel judge picked variant ${winner} of ${specs.length}`);

  return { ...(await renderSpecVideo(specs[winner], renderOpts)), source: "judged", valid: specs.length };
}
