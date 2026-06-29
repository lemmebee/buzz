import { mkdirSync, readFileSync } from "fs";
import path from "path";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { parseSrt } from "@remotion/captions";
import { getRemotionBundle, ensureRemotionBrowser } from "@/lib/remotion-bundle";
import { COMPOSITION_ID, type BuzzVideoProps, type RemotionCaption } from "@/remotion/types";
import type { VideoProvider, VideoGenerationInput, VideoGenerationOutput } from "./types";

const FPS = 25; // matches the ffmpeg baseline (compose.ts) for diffable parity

function dimensionsFor(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "9:16": return { width: 1080, height: 1920 };
    case "16:9": return { width: 1920, height: 1080 };
    case "4:5": return { width: 1080, height: 1350 };
    case "1:1":
    default: return { width: 1080, height: 1080 };
  }
}

// Convert an absolute path under public/ into a staticFile()-relative path,
// e.g. /repo/public/media/x.jpg -> "media/x.jpg".
function toPublicRelative(absPath: string): string {
  const publicDir = path.join(process.cwd(), "public");
  return path.relative(publicDir, absPath).split(path.sep).join("/");
}

const NAMED_COLORS: Record<string, string> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#facc15",
  gold: "#d4af37", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6",
  cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6", navy: "#1e3a8a",
  indigo: "#6366f1", purple: "#a855f7", violet: "#8b5cf6", magenta: "#d946ef",
  pink: "#ec4899", rose: "#f43f5e", lime: "#84cc16",
};

// Resolve a vivid accent color from free-text brand colors ("navy and gold").
// Never throws; falls back to a TikTok-style yellow.
function resolveAccent(colors?: string): string {
  if (colors) {
    const hex = colors.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/);
    if (hex) return hex[0];
    const lower = colors.toLowerCase();
    for (const [name, hexv] of Object.entries(NAMED_COLORS)) {
      if (lower.includes(name)) return hexv;
    }
  }
  return "#ffd60a";
}

function parseCaptions(captionsPath?: string): RemotionCaption[] {
  if (!captionsPath) return [];
  try {
    const input = readFileSync(captionsPath, "utf-8");
    const { captions } = parseSrt({ input });
    return captions
      .filter((c) => c.text.trim().length > 0)
      .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs }));
  } catch (err) {
    console.warn("[remotion] failed to parse captions, rendering without:", err instanceof Error ? err.message : err);
    return [];
  }
}

export function createRemotionVideoProvider(): VideoProvider {
  return {
    name: "remotion",

    async generate(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
      const { scenes, audioPath, captionsPath, aspectRatio, durationSec, branding } = input;
      if (!scenes || scenes.length === 0) {
        throw new Error("remotion video provider requires non-empty scenes");
      }
      if (!audioPath) {
        throw new Error("remotion video provider requires audioPath");
      }

      const { width, height } = dimensionsFor(aspectRatio);

      const remotionScenes = scenes.map((s) => ({
        src: toPublicRelative(s.imagePath),
        durationInFrames: Math.max(1, Math.round(s.durationSec * FPS)),
      }));
      const durationInFrames = remotionScenes.reduce((sum, s) => sum + s.durationInFrames, 0);

      const inputProps: BuzzVideoProps = {
        scenes: remotionScenes,
        audioSrc: toPublicRelative(audioPath),
        captions: parseCaptions(captionsPath),
        showCaptions: Boolean(captionsPath),
        width,
        height,
        fps: FPS,
        durationInFrames,
        branding: {
          bgColor: "#0b0b0f",
          accentColor: resolveAccent(branding?.colors),
          handle: branding?.handle,
          logoSrc: branding?.logoDataUri,
        },
      };

      const serveUrl = await getRemotionBundle();
      await ensureRemotionBrowser();

      const composition = await selectComposition({
        serveUrl,
        id: COMPOSITION_ID,
        inputProps,
      });

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
        duration: durationSec,
      };
    },
  };
}
