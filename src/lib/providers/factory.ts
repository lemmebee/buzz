import type { TextProvider } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";

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
