import { mkdirSync } from "fs";
import path from "path";
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
  opts: { imageProviderName?: string | null }
): Promise<RenderSpecResult> {
  const { width, height } = dimsFor(spec.aspectRatio);
  const fps = spec.fps;

  // 1. Resolve each scene's background. Image scenes generate a still; on
  //    failure the scene auto-degrades to a solid color so the render proceeds.
  const imageProvider = await resolveImageProvider(opts.imageProviderName);
  const resolvedScenes: ResolvedScene[] = [];
  for (const scene of spec.scenes) {
    let bgImageSrc: string | undefined;
    let bgKind = scene.bgKind;
    if (scene.bgKind === "image" && scene.bgImagePrompt.trim()) {
      try {
        const img = await imageProvider.generate({ prompt: scene.bgImagePrompt, width, height });
        // Prefer the downloaded local copy (localPath is an /api/media/ path);
        // fall back to a remote url which the renderer passes straight to <Img>.
        bgImageSrc = img.localPath ? urlToStaticRel(img.localPath) : img.url;
      } catch (err) {
        console.warn(`[spec] scene image failed, using color: ${err instanceof Error ? err.message : err}`);
        bgKind = "color";
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

  // 3. Whisper captions from the voiceover (treatment from the spec).
  //    De-dup: if scenes already carry hero text, suppress the caption track so
  //    the same words don't appear twice on screen.
  const hasHeroText = resolvedScenes.some((s) =>
    s.layers.some((l) => l.kind === "text" && l.sizePct >= 8 && l.text.trim().length > 0)
  );
  const showCaptions = spec.caption.show && !hasHeroText;

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

  // 4. Total duration = sum(scenes) minus each inserted transition's overlap.
  const transitionsInserted = resolvedScenes.filter((s, i) => i > 0 && s.transition !== "none").length;
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
