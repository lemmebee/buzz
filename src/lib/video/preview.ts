import { mkdirSync } from "fs";
import path from "path";
import sharp from "sharp";
import { selectComposition, renderStill } from "@remotion/renderer";
import { getRemotionBundle, ensureRemotionBrowser } from "@/lib/remotion-bundle";
import { SPEC_COMPOSITION_ID, type ResolvedScene, type SpecVideoProps, type VideoSpecT } from "@/remotion/spec";
import { dimsFor } from "./render-spec";

// Judging N candidate videos by rendering each in full (TTS + per-scene image
// generation + whisper + encode) would cost minutes per candidate. Instead we
// render a cheap CONTACT SHEET per candidate — one still per scene, no audio, no
// whisper, and generated ("image") backgrounds downgraded to the brand gradient
// so no FLUX calls fire. The judge compares typography, layout, and the visual
// arc across scenes; the full render (real backgrounds, audio) is paid only for
// the winner.

function previewScene(scene: VideoSpecT["scenes"][number], productShots: string[], idxRef: { i: number }): ResolvedScene {
  let bgKind: ResolvedScene["bgKind"] = scene.bgKind === "product" ? "image" : scene.bgKind;
  let bgImageSrc: string | undefined;
  if (scene.bgKind === "product" && productShots.length > 0) {
    bgImageSrc = productShots[idxRef.i % productShots.length];
    idxRef.i++;
  } else if (scene.bgKind === "product" || scene.bgKind === "image") {
    // No FLUX in preview; real screenshots stay, everything generated → gradient.
    bgKind = "gradient";
  }
  return {
    durationInFrames: scene.durationInFrames,
    bgKind,
    bgImageSrc,
    bgColor: scene.bgColor,
    bgColor2: scene.bgColor2,
    kenBurns: "none", // stills: no need to animate the zoom
    transition: "none",
    align: scene.align,
    decor: scene.decor,
    layers: scene.layers,
  };
}

// Render a vertical contact sheet (one still per scene) for one candidate spec.
// Returns an /api/media/ url the vision judge can read.
export async function renderPreviewSheet(
  spec: VideoSpecT,
  opts: { productShots?: string[]; label: string }
): Promise<string> {
  const { width, height } = dimsFor(spec.aspectRatio);
  const productShots = (opts.productShots ?? []).filter(Boolean);
  const idxRef = { i: 0 };
  const scenes = spec.scenes.map((s) => previewScene(s, productShots, idxRef));

  const serveUrl = await getRemotionBundle();
  await ensureRemotionBrowser();

  const mediaDir = path.join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });

  // Each scene rendered standalone at its own midpoint frame — sidesteps
  // TransitionSeries frame math and guarantees a clean, at-rest still per scene.
  const tiles: Buffer[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const props: SpecVideoProps = {
      scenes: [scene],
      audioSrc: "",
      captions: [],
      caption: { show: false, position: "lower-third", fontFamily: "Inter" },
      palette: spec.palette,
      width,
      height,
      fps: spec.fps,
      durationInFrames: scene.durationInFrames,
    };
    const composition = await selectComposition({ serveUrl, id: SPEC_COMPOSITION_ID, inputProps: props });
    const tilePath = path.join(mediaDir, `preview-${opts.label}-${i}.jpg`);
    await renderStill({
      composition,
      serveUrl,
      // Midpoint: past the ~12-frame entrance, so all words are at rest.
      frame: Math.min(scene.durationInFrames - 1, Math.max(20, Math.round(scene.durationInFrames / 2))),
      output: tilePath,
      inputProps: props,
      imageFormat: "jpeg",
      jpegQuality: 80,
    });
    tiles.push(await sharp(tilePath).toBuffer());
  }

  // Stack scene stills vertically into one sheet, downscaled so the whole arc
  // fits in a single judge-friendly image.
  const sheetName = `preview-${opts.label}.jpg`;
  const sheetPath = path.join(mediaDir, sheetName);
  const tileW = 480;
  const resized = await Promise.all(
    tiles.map((b) => sharp(b).resize({ width: tileW }).toBuffer())
  );
  const metas = await Promise.all(resized.map((b) => sharp(b).metadata()));
  const tileHeights = metas.map((m) => m.height ?? Math.round((tileW * height) / width));
  const totalH = tileHeights.reduce((s, h) => s + h, 0);
  let y = 0;
  const composites = resized.map((input, i) => {
    const top = y;
    y += tileHeights[i];
    return { input, top, left: 0 };
  });
  await sharp({ create: { width: tileW, height: totalH, channels: 3, background: "#000000" } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(sheetPath);

  return `/api/media/${sheetName}`;
}
