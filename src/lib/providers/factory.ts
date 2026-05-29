import type { TextProvider, AudioProvider, VideoProvider, SceneRenderer } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";
import { createMsEdgeTtsAudioProvider } from "./audio";
import { createFfmpegVideoProvider } from "./video";
import { createSatoriResvgRenderer } from "@/lib/compose/render/satoriResvg";

export function createTextProvider(providerName?: string): TextProvider {
  const provider = providerName || process.env.TEXT_PROVIDER || "gemini";

  switch (provider) {
    case "gemini":
      return createGeminiTextProvider();
    case "gemini-flash-lite":
      return createGeminiTextProvider({ model: "gemini-2.5-flash-lite" });
    case "huggingface":
      return createHuggingFaceTextProvider();
    default:
      throw new Error(`Unknown TEXT_PROVIDER: ${provider}`);
  }
}

export function createAudioProvider(providerName?: string): AudioProvider {
  const provider = providerName || process.env.AUDIO_PROVIDER || "msedge";
  switch (provider) {
    case "msedge":
      return createMsEdgeTtsAudioProvider();
    default:
      throw new Error(`Unknown AUDIO_PROVIDER: ${provider}`);
  }
}

export function createVideoProvider(providerName?: string): VideoProvider {
  const provider = providerName || process.env.VIDEO_PROVIDER || "ffmpeg";
  switch (provider) {
    case "ffmpeg":
      return createFfmpegVideoProvider();
    default:
      throw new Error(`Unknown VIDEO_PROVIDER: ${provider}`);
  }
}

export function createSceneRenderer(rendererName?: string): SceneRenderer {
  const renderer = rendererName || process.env.SCENE_RENDERER || "satori";
  switch (renderer) {
    case "satori":
    case "satori/resvg":
      return createSatoriResvgRenderer();
    default:
      throw new Error(`Unknown SCENE_RENDERER: ${renderer}`);
  }
}
