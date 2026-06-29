import type { TextProvider, AudioProvider, VideoProvider, ImageProvider } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";
import { createAntigravityTextProvider } from "./antigravity";
import { createMsEdgeTtsAudioProvider } from "./audio";
import { createFfmpegVideoProvider } from "./video";
import { createPollinationsImageProvider } from "./image";
import { createGeminiImageProvider } from "./image-gemini";
import { createHuggingFaceImageProvider } from "./image-hf";
import { isTerminalProviderError } from "./errors";
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

// Known image providers in default fallback priority. The active provider
// (product override or global IMAGE_PROVIDER) is always tried first; the rest
// act as fallbacks when the user has configured them.
const IMAGE_PROVIDER_PRIORITY = ["gemini", "huggingface", "pollinations"];

// Build one image provider by name, or null if it can't be built because its
// API key is missing. Pollinations needs no key, so it always builds.
async function buildImageProvider(name: string): Promise<ImageProvider | null> {
  switch (name) {
    case "pollinations": {
      const apiKey = await getApiKey("POLLINATIONS_API_KEY");
      return createPollinationsImageProvider({ apiKey });
    }
    case "gemini": {
      const apiKey = await getApiKey("GOOGLE_AI_API_KEY");
      return apiKey ? createGeminiImageProvider({ apiKey }) : null;
    }
    case "huggingface": {
      const apiKey = await getApiKey("HUGGINGFACE_API_KEY");
      if (!apiKey) return null;
      const model = await getImageModel();
      return createHuggingFaceImageProvider({ apiKey, model });
    }
    default:
      return null;
  }
}

// Wraps an ordered list of providers: tries each in turn and returns the first
// success. A provider that returns a terminal error (out of credits, bad key)
// is dropped for the rest of the run so we don't keep hammering a dead provider.
function createFallbackImageProvider(providers: ImageProvider[]): ImageProvider {
  const dead = new Set<string>();
  return {
    name: `fallback[${providers.map((p) => p.name).join(" > ")}]`,
    async generate(input) {
      let attempted = 0;
      let lastErr: unknown;
      for (const p of providers) {
        if (dead.has(p.name)) continue;
        attempted++;
        try {
          return await p.generate(input);
        } catch (err) {
          lastErr = err;
          const terminal = isTerminalProviderError(err);
          if (terminal) dead.add(p.name);
          console.warn(
            `[image] provider "${p.name}" failed${terminal ? " (terminal — skipping for rest of run)" : ""}: ${err instanceof Error ? err.message : err}`
          );
        }
      }
      if (attempted === 0) {
        throw new Error("All configured image providers are exhausted or unavailable");
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    },
  };
}

export async function resolveImageProvider(productImageProvider?: string | null): Promise<ImageProvider> {
  const primary = productImageProvider || (await getImageProviderName());
  const order = [primary, ...IMAGE_PROVIDER_PRIORITY.filter((n) => n !== primary)];

  const providers: ImageProvider[] = [];
  for (const name of order) {
    // Keyless Pollinations is only auto-added as a *fallback* when the user has
    // actually configured it, so single-provider setups don't get surprise
    // fallbacks. gemini/huggingface self-gate on their key in buildImageProvider.
    if (name !== primary && name === "pollinations" && !(await getApiKey("POLLINATIONS_API_KEY"))) {
      continue;
    }
    const provider = await buildImageProvider(name);
    if (provider) providers.push(provider);
  }

  if (providers.length === 0) {
    throw new Error(`No image provider configured for "${primary}". Add its API key in settings.`);
  }
  return providers.length === 1 ? providers[0] : createFallbackImageProvider(providers);
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
