import type { TextProvider } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";

export function createTextProvider(providerName?: string): TextProvider {
  const raw = (providerName || process.env.TEXT_PROVIDER || "gemini").toLowerCase().trim();

  // Accept legacy/custom provider labels and model IDs by mapping them
  // to the closest supported provider instead of failing extraction.
  const provider =
    raw === "gemini" || raw.includes("gemini")
      ? "gemini"
      : raw === "huggingface" || raw.includes("huggingface")
        ? "huggingface"
        : raw;

  switch (provider) {
    case "gemini":
      return createGeminiTextProvider();
    case "huggingface":
      return createHuggingFaceTextProvider();
    default:
      console.warn(`Unknown TEXT_PROVIDER "${raw}", falling back to "gemini"`);
      return createGeminiTextProvider();
  }
}
