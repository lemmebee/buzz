// Types
export type {
  Provider,
  TextProvider,
  ImageProvider,
  VideoProvider,
  AudioProvider,
  TextGenerationInput,
  TextGenerationOutput,
  ImageGenerationInput,
  ImageGenerationOutput,
  VideoGenerationInput,
  VideoGenerationOutput,
  AudioGenerationInput,
  AudioGenerationOutput,
  ProviderConfig,
} from "./types";


// Text provider implementations
export { createHuggingFaceTextProvider } from "./text";
export { createGeminiTextProvider } from "./gemini";
export { createAntigravityTextProvider, listAntigravityModels } from "./antigravity";
export { createClaudeCodeTextProvider, listClaudeCodeModels } from "./claude-code";

// Image provider implementations
export { createPollinationsImageProvider } from "./image";
export { createGeminiImageProvider } from "./image-gemini";
export { createHuggingFaceImageProvider } from "./image-hf";


// Factory entry points
export { createTextProvider, resolveTextProvider, resolveImageProvider, listImageProviderNames } from "./factory";

// Image-provider health (pre-flight "can we generate images this run?")
export { imagesAvailable, markImageProviderDown, markImageProviderUp, isImageProviderDown } from "./image-health";
