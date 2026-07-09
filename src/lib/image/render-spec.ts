import { mkdirSync } from "fs";
import path from "path";
import sharp from "sharp";
import { selectComposition, renderStill } from "@remotion/renderer";
import { resolveImageProvider } from "@/lib/providers";
import { getRemotionBundle, ensureRemotionBrowser } from "@/lib/remotion-bundle";
import {
  IMAGE_COMPOSITION_ID,
  clampImageIndex,
  type ImageSpecT,
  type ImageCompositionProps,
  type ResolvedImageBgKind,
} from "@/remotion/image-spec";
import type { LayerT } from "@/remotion/spec";

function dimsFor(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "9:16": return { width: 1080, height: 1920 };
    case "16:9": return { width: 1920, height: 1080 };
    case "4:5": return { width: 1080, height: 1350 };
    case "1:1":
    default: return { width: 1080, height: 1080 };
  }
}

function urlToStaticRel(url: string): string {
  return (url || "").replace(/^\/api\/media\//, "media/");
}

// Typography GUARANTEE for images: every spec must have at least one text layer.
// If the LLM omitted text, inject a hero line from the product name.
const DISPLAY_FONTS = ["Anton", "Bebas Neue", "Archivo Black", "Montserrat", "Oswald"] as const;
const HERO_POSITIONS: LayerT["position"][] = ["center", "upper-third", "lower-third"];

function guaranteeTypography(spec: ImageSpecT, productName: string): ImageSpecT {
  const hasText = spec.layers.some((l) => l.kind === "text" && l.text.trim().length > 0);
  if (hasText) return spec;
  const hero: LayerT = {
    kind: "text",
    text: productName.split(/\s+/).slice(0, 4).join(" ").toUpperCase(),
    position: HERO_POSITIONS[0],
    animation: "none",
    fontFamily: DISPLAY_FONTS[0],
    sizePct: 14,
    color: spec.palette.text,
    accent: false,
    uppercase: true,
    shape: "rect",
    xPct: 50,
    yPct: 50,
    widthPct: 40,
    heightPct: 20,
    opacity: 1,
  };
  return { ...spec, layers: [...spec.layers, hero] };
}

export interface RenderImageResult {
  url: string;
  localPath: string;
  width: number;
  height: number;
}

export interface RenderImageOpts {
  imageProviderName?: string | null;
  productShots?: string[];
  uploadedImages?: string[];
  productName?: string;
  // Generated backgrounds are expensive and non-deterministic. When several
  // candidate specs are rendered for comparison, a shared cache keyed by prompt
  // keeps the photo identical across them, so a judge compares layouts rather
  // than backgrounds — and a re-render of the winner reuses its own background.
  bgCache?: Map<string, string>;
}

// Turns an authored ImageSpec into a rendered image file:
//   1. Resolve each bgKind to a real asset (product shot, user upload, generated, or gradient/color)
//   2. Render the still via Remotion's renderStill
// Falls back to gradient/color if asset resolution fails.
export async function renderSpecImage(
  spec: ImageSpecT,
  opts: RenderImageOpts = {}
): Promise<RenderImageResult> {
  const { width, height } = dimsFor(spec.aspectRatio);
  const productShots = (opts.productShots ?? []).filter(Boolean);
  const uploadedImages = (opts.uploadedImages ?? []).filter(Boolean);

  // Guarantee at least one text layer
  const healed = guaranteeTypography(spec, opts.productName || "Your Brand");

  // Resolve background
  let bgKind: ResolvedImageBgKind = "color";
  let bgImageSrc: string | undefined;
  let bgFit: "cover" | "contain" = "cover";

  if (healed.bgKind === "product" && productShots.length > 0) {
    const idx = clampImageIndex(healed.bgImageIndex, productShots.length);
    bgImageSrc = productShots[idx];
    bgKind = "image";
    // Screenshots are tall; cover would crop them to a meaningless slice.
    bgFit = "contain";
  } else if (healed.bgKind === "uploaded" && uploadedImages.length > 0) {
    const idx = clampImageIndex(healed.bgImageIndex, uploadedImages.length);
    bgImageSrc = uploadedImages[idx];
    bgKind = "image";
  } else if (healed.bgKind === "generated" && healed.bgImagePrompt.trim()) {
    try {
      const cacheKey = `${width}x${height}:${healed.bgImagePrompt.trim()}`;
      const cached = opts.bgCache?.get(cacheKey);
      if (cached) {
        bgImageSrc = cached;
        bgKind = "image";
      } else {
        const imageProvider = await resolveImageProvider(opts.imageProviderName);
        const img = await imageProvider.generate({
          prompt: healed.bgImagePrompt,
          width,
          height,
        });
        bgImageSrc = img.localPath ? urlToStaticRel(img.localPath) : undefined;
        if (bgImageSrc) {
          bgKind = "image";
          opts.bgCache?.set(cacheKey, bgImageSrc);
        } else bgKind = "gradient";
      }
    } catch (err) {
      console.warn(`[image-spec] bg generation failed, using gradient: ${err instanceof Error ? err.message : err}`);
      bgKind = "gradient";
    }
  } else if (healed.bgKind === "gradient") {
    bgKind = "gradient";
  } else {
    bgKind = "color";
  }

  // Resolve the showcase's imageIndex against the real asset pool (product shots
  // first, then user uploads). An unresolvable index means no showcase, not a
  // broken render.
  const showcasePool = [...productShots, ...uploadedImages];
  let showcase: ImageCompositionProps["showcase"];
  if (healed.showcase && showcasePool.length > 0) {
    const src = showcasePool[clampImageIndex(healed.showcase.imageIndex, showcasePool.length)];
    // Measure the screenshot so the device body takes its real aspect (avoids
    // cropping the app's own UI). Fall back to a typical handset ratio.
    let aspect = 0.4615;
    try {
      const abs = path.join(process.cwd(), "public", src.replace(/^\/api\/media\//, "media/"));
      const meta = await sharp(abs).metadata();
      if (meta.width && meta.height) aspect = meta.width / meta.height;
    } catch { /* keep default aspect */ }
    showcase = {
      treatment: healed.showcase.treatment,
      src,
      position: healed.showcase.position,
      tilt: healed.showcase.tilt,
      aspect,
    };
  }

  const inputProps: ImageCompositionProps = {
    bgKind,
    bgImageSrc,
    bgFit,
    archetype: healed.archetype,
    align: healed.align,
    decor: healed.decor,
    showcase,
    bgColor: healed.bgColor,
    bgColor2: healed.bgColor2,
    layers: healed.layers,
    palette: healed.palette,
    width,
    height,
    fps: 30,
    durationInFrames: 1,
  };

  // Render still via Remotion
  const serveUrl = await getRemotionBundle();
  await ensureRemotionBrowser();

  const composition = await selectComposition({
    serveUrl,
    id: IMAGE_COMPOSITION_ID,
    inputProps,
  });

  const mediaDir = path.join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });
  const filename = `image-${Date.now()}.jpg`;
  const outputPath = path.join(mediaDir, filename);

  await renderStill({
    composition,
    serveUrl,
    frame: 0,
    output: outputPath,
    inputProps,
    imageFormat: "jpeg",
    jpegQuality: 92,
  });

  return {
    url: `/api/media/${filename}`,
    localPath: outputPath,
    width,
    height,
  };
}
