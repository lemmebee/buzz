import type { TextProvider } from "@/lib/providers/types";
import { pickWinner, resolveVisionProvider } from "@/lib/image/vision-judge";
import { authorVideoVariants, buildFallbackSpec, type AuthorInput } from "./spec-author";
import { renderSpecVideo, type RenderSpecResult } from "./render-spec";
import { renderPreviewSheet } from "./preview";
import { reviewRenderedVideo, cleanupReviewFrames } from "./final-review";
import type { VideoSpecT } from "@/remotion/spec";

export interface SelectVideoInput extends AuthorInput {
  textProvider: TextProvider;
  n?: number;
  fallbackPalette?: { bg: string; accent: string; text: string };
  productShotPaths: string[]; // staticFile-relative product screenshots for render + preview
  imageProviderName?: string | null;
}

const visionEnabled = () => process.env.VIDEO_VISION_LOOP !== "0";

// Full-render a spec, then self-review the actual output (ffprobe + volumedetect
// + frame spot-check). A hard technical failure (unplayable, silent-when-
// narrated, all-black) throws so a broken video is never presented as success;
// softer issues are logged and shipped for this one-shot pipeline.
async function renderAndReview(
  spec: VideoSpecT,
  renderOpts: { imageProviderName?: string | null; productShots: string[] },
  targetDurationSec: number
): Promise<RenderSpecResult> {
  const r = await renderSpecVideo(spec, renderOpts);
  const review = await reviewRenderedVideo({
    localPath: r.localPath,
    targetDurationSec,
    narrated: spec.script.trim().length > 0,
  });
  if (review.issues.length) console.log(`[final-review] ${review.status}: ${review.issues.join("; ")}`);
  cleanupReviewFrames(review);
  if (review.status === "fail") {
    throw new Error(`final review failed: ${review.issues.join("; ")}`);
  }
  return r;
}

// Author N variants, render a CHEAP contact-sheet preview of each, and let the
// pairwise vision judge pick the winner from the frames — not from a four-field
// JSON summary that can't see a colliding hero or a buried screenshot. Only the
// winner pays for a full render (TTS + real backgrounds + whisper + encode).
export async function renderBestVideo(input: SelectVideoInput): Promise<RenderSpecResult & { source: string; valid: number }> {
  const n = Math.max(1, input.n ?? 3);
  const renderOpts = { imageProviderName: input.imageProviderName, productShots: input.productShotPaths };

  // Let the director SEE the product screenshots when authoring variants.
  const authorInput = { ...input, assetImages: input.productShotPaths };
  const specs = await authorVideoVariants(input.textProvider, authorInput, n);
  console.log(`[video-select] authored ${specs.length}/${n} valid variant(s)`);

  if (specs.length === 0) {
    const fallback = buildFallbackSpec({
      script: input.script?.trim() || input.productName,
      palette: input.fallbackPalette ?? { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" },
      aspectRatio: input.aspectRatio,
      durationSec: input.durationSec,
    });
    return { ...(await renderAndReview(fallback, renderOpts, input.durationSec)), source: "deterministic", valid: 0 };
  }

  if (specs.length === 1 || !visionEnabled()) {
    return { ...(await renderAndReview(specs[0], renderOpts, input.durationSec)), source: "single", valid: specs.length };
  }

  // Cheap previews, sequentially (each drives headless Chrome).
  const sheets: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    sheets.push(await renderPreviewSheet(specs[i], { productShots: input.productShotPaths, label: String(i) }));
  }

  const vision = resolveVisionProvider();
  const { winner, decisive } = await pickWinner(vision, sheets, {
    productName: input.productName,
    vibe: input.vibe,
    caption: input.script,
  });

  // When the judge can't decide, don't always ship candidate 0 (identical output
  // every generation). Break the tie with variety, preferring a variant that
  // shows the product when screenshots are available.
  let chosen = winner;
  if (!decisive) {
    const hasShots = input.productShotPaths.length > 0;
    const productIdx = specs
      .map((s, i) => (s.scenes.some((sc) => sc.showcase !== null || sc.bgKind === "product") ? i : -1))
      .filter((i) => i >= 0);
    const pool = hasShots && productIdx.length > 0 ? productIdx : specs.map((_, i) => i);
    chosen = pool[Math.floor(Math.random() * pool.length)];
    console.log(`[video-select] judge undecided — tie-break to ${chosen} (product-preferred=${hasShots && productIdx.length > 0})`);
  } else {
    console.log(`[video-select] pixel judge picked variant ${winner} of ${specs.length}`);
  }

  return { ...(await renderAndReview(specs[chosen], renderOpts, input.durationSec)), source: "judged", valid: specs.length };
}
