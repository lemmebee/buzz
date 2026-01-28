import type { TextProvider } from "./types";
import { createHuggingFaceTextProvider } from "./text";
import { createGeminiTextProvider } from "./gemini";

export function createTextProvider(): TextProvider {
  const provider = process.env.TEXT_PROVIDER || "gemini";

  switch (provider) {
    case "gemini":
      return createGeminiTextProvider();
    case "huggingface":
      return createHuggingFaceTextProvider();
    default:
      throw new Error(`Unknown TEXT_PROVIDER: ${provider}`);
  }
}
