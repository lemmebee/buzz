import { mkdirSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { parseSrt } from "@remotion/captions";
import { resolveImageProvider, createAudioProvider } from "@/lib/providers";
import { transcribeToSrt } from "@/lib/captions";
import { getRemotionBundle, ensureRemotionBrowser } from "@/lib/remotion-bundle";
import {
  SPEC_COMPOSITION_ID,
  TRANSITION_FRAMES,
  type VideoSpecT,
  type ResolvedScene,
  type SpecVideoProps,
} from "@/remotion/spec";

const execFileP = promisify(execFile);

// Best-effort audio duration in seconds (ffprobe is on PATH on the render box).
async function probeAudioSeconds(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

function dimsFor(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "9:16": return { width: 1080, height: 1920 };
    case "16:9": return { width: 1920, height: 1080 };
    case "4:5": return { width: 1080, height: 1350 };
    case "1:1":
    default: return { width: 1080, height: 1080 };
  }
}

function urlToStaticRel(url: string | undefined): string {
  return (url || "").replace(/^\/api\/media\//, "media/");
}

export interface RenderSpecResult {
  url: string;
  localPath: string;
  duration: number;
  width: number;
  height: number;
  audioUrl: string | null;
  captionsUrl: string | null;
}

// Turns an authored VideoSpec into a rendered mp4: generates each scene's
// background image, the voiceover, and whisper captions, then renders the
// flexible SpecVideo composition. Reuses buzz's existing provider pipeline.
export async function renderSpecVideo(
  spec: VideoSpecT,
  opts: { imageProviderName?: string | null; productShots?: string[] }
): Promise<RenderSpecResult> {
  const { width, height } = dimsFor(spec.aspectRatio);
  const fps = spec.fps;

  // 1. Resolve each scene's background:
  //    - "product"  → a REAL product screenshot (credit-free, on-brand) — never
  //      a generated still, so the video shows the ACTUAL app, not a fake one.
  //    - "image"    → generate a still from the prompt; on failure → gradient.
  //    - color/gradient → as-is.
  const productShots = (opts.productShots ?? []).filter(Boolean);
  let productShotIdx = 0;
  const imageProvider = await resolveImageProvider(opts.imageProviderName);
  const resolvedScenes: ResolvedScene[] = [];
  for (const scene of spec.scenes) {
    let bgImageSrc: string | undefined;
    // "product" renders as an image (a real screenshot); everything else maps 1:1.
    let bgKind: ResolvedScene["bgKind"] = scene.bgKind === "product" ? "image" : scene.bgKind;
    if (scene.bgKind === "product") {
      if (productShots.length > 0) {
        bgImageSrc = productShots[productShotIdx % productShots.length];
        productShotIdx++;
      } else {
        bgKind = "gradient"; // no screenshots available — don't generate a fake one
      }
    } else if (scene.bgKind === "image" && scene.bgImagePrompt.trim()) {
      try {
        const img = await imageProvider.generate({ prompt: scene.bgImagePrompt, width, height });
        // Prefer the downloaded local copy (localPath is an /api/media/ path);
        // fall back to a remote url which the renderer passes straight to <Img>.
        bgImageSrc = img.localPath ? urlToStaticRel(img.localPath) : img.url;
      } catch (err) {
        console.warn(`[spec] scene image failed, using gradient: ${err instanceof Error ? err.message : err}`);
        bgKind = "gradient";
      }
    }
    resolvedScenes.push({
      durationInFrames: scene.durationInFrames,
      bgKind,
      bgImageSrc,
      bgColor: scene.bgColor,
      bgColor2: scene.bgColor2,
      kenBurns: scene.kenBurns,
      transition: scene.transition,
      layers: scene.layers,
    });
  }

  // 2. Voiceover from the script.
  let audioSrc = "";
  let audioFsPath = "";
  if (spec.script.trim()) {
    try {
      const audio = await createAudioProvider().generate({ script: spec.script });
      audioSrc = urlToStaticRel(audio.url);
      audioFsPath = audio.localPath || "";
    } catch (err) {
      console.warn(`[spec] TTS failed, rendering silent: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 3. Whisper captions from the voiceover.
  //    This is a typography-led art video: the designed text layers ARE the
  //    on-screen words, so we never burn voiceover captions on top. The
  //    typography guarantee (spec-author) ensures every scene already carries
  //    its own bold text, and pins caption.show=false. We still respect the flag
  //    defensively so captions can't sneak in over the designed type.
  const showCaptions = spec.caption.show;

  let captions: SpecVideoProps["captions"] = [];
  let captionsUrl: string | null = null;
  if (showCaptions && audioFsPath) {
    const srtPath = await transcribeToSrt(audioFsPath);
    if (srtPath) {
      const { readFileSync } = await import("fs");
      const { basename } = await import("path");
      try {
        const parsed = parseSrt({ input: readFileSync(srtPath, "utf-8") });
        captions = parsed.captions
          .filter((c) => c.text.trim().length > 0)
          .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs }));
        captionsUrl = `/api/media/${basename(srtPath)}`;
      } catch (err) {
        console.warn(`[spec] caption parse failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // 3.5 Fit the video to the voiceover so narration is NEVER cut off (and there
  //     is no long silent tail): scale every scene's duration so the total covers
  //     the full audio + a short tail. With a duration-sized script this is ~1.0
  //     and only corrects drift; a too-long script stretches the video to fit.
  const transitionsInserted = resolvedScenes.filter((s, i) => i > 0 && s.transition !== "none").length;
  if (audioFsPath) {
    const audioSec = await probeAudioSeconds(audioFsPath);
    if (audioSec) {
      const tail = Math.round(0.4 * fps);
      const targetVideoFrames = Math.ceil(audioSec * fps) + tail;
      const sceneTotal = resolvedScenes.reduce((sum, s) => sum + s.durationInFrames, 0);
      const desiredSceneTotal = targetVideoFrames + transitionsInserted * TRANSITION_FRAMES;
      const scale = desiredSceneTotal / sceneTotal;
      if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 0.02) {
        for (const s of resolvedScenes) s.durationInFrames = Math.max(20, Math.round(s.durationInFrames * scale));
        console.log(`[spec] fit video to voiceover ${audioSec.toFixed(1)}s (scaled scenes ×${scale.toFixed(2)})`);
      }
    }
  }

  // 4. Total duration = sum(scenes) minus each inserted transition's overlap.
  const durationInFrames = Math.max(
    1,
    resolvedScenes.reduce((sum, s) => sum + s.durationInFrames, 0) - transitionsInserted * TRANSITION_FRAMES
  );

  const inputProps: SpecVideoProps = {
    scenes: resolvedScenes,
    audioSrc,
    captions,
    caption: { show: showCaptions, position: spec.caption.position, fontFamily: spec.caption.fontFamily },
    palette: spec.palette,
    width,
    height,
    fps,
    durationInFrames,
  };

  // 5. Render.
  const serveUrl = await getRemotionBundle();
  await ensureRemotionBrowser();
  const composition = await selectComposition({ serveUrl, id: SPEC_COMPOSITION_ID, inputProps });

  const mediaDir = path.join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });
  const filename = `video-${Date.now()}.mp4`;
  const outputPath = path.join(mediaDir, filename);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    imageFormat: "jpeg",
    crf: 18,
    concurrency: 1,
  });

  return {
    url: `/api/media/${filename}`,
    localPath: outputPath,
    duration: durationInFrames / fps,
    width,
    height,
    audioUrl: audioSrc ? `/api/media/${audioSrc.replace(/^media\//, "")}` : null,
    captionsUrl,
  };
}
