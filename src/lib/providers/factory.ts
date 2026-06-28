import type { TextProvider, AudioProvider, VideoProvider, ImageProvider } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";
import { createAntigravityTextProvider } from "./antigravity";
import { createMsEdgeTtsAudioProvider } from "./audio";
import { createFfmpegVideoProvider } from "./video";
import { createPollinationsImageProvider } from "./image";
import { createGeminiImageProvider } from "./image-gemini";
import { createHuggingFaceImageProvider } from "./image-hf";
import { getTextProvider, getImageProviderName, getApiKey, getImageModel } from "@/lib/settings";

export function createTextProvider(providerName?: string, config?: { apiKey?: string }): TextProvider {
  const provider = providerName || process.env.TEXT_PROVIDER || "gemini";

  if (provider.startsWith("antigravity")) {
    const model = provider.includes(":") ? provider.split(":").slice(1).join(":") : undefined;
    return createAntigravityTextProvider(model ? { model } : {});
  }

  switch (provider) {
    case "gemini":
      return createGeminiTextProvider(config);
    case "gemini-flash-lite":
      return createGeminiTextProvider({ ...config, model: "gemini-2.5-flash-lite" });
    case "huggingface":
      return createHuggingFaceTextProvider(config);
    default:
      throw new Error(`Unknown TEXT_PROVIDER: ${provider}`);
  }
}

export async function resolveTextProvider(productTextProvider?: string | null): Promise<TextProvider> {
  const name = productTextProvider || (await getTextProvider());
  let apiKey = "";

  if (name.startsWith("gemini")) {
    apiKey = await getApiKey("GOOGLE_AI_API_KEY");
  } else if (name === "huggingface") {
    apiKey = await getApiKey("HUGGINGFACE_API_KEY");
  }

  return createTextProvider(name, { apiKey });
}

export async function resolveImageProvider(productImageProvider?: string | null): Promise<ImageProvider> {
  const name = productImageProvider || (await getImageProviderName());

  switch (name) {
    case "pollinations": {
      const apiKey = await getApiKey("POLLINATIONS_API_KEY");
      return createPollinationsImageProvider({ apiKey });
    }
    case "gemini": {
      const apiKey = await getApiKey("GOOGLE_AI_API_KEY");
      if (!apiKey) throw new Error("Google AI API key required for Gemini image generation");
      return createGeminiImageProvider({ apiKey });
    }
    case "huggingface": {
      const apiKey = await getApiKey("HUGGINGFACE_API_KEY");
      if (!apiKey) throw new Error("HuggingFace API key required");
      const model = await getImageModel();
      return createHuggingFaceImageProvider({ apiKey, model });
    }
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: ${name}`);
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
