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

// Registry
export {
  registerTextProvider,
  registerImageProvider,
  registerVideoProvider,
  registerAudioProvider,
  getTextProvider,
  getImageProvider,
  getVideoProvider,
  getAudioProvider,
  hasTextProvider,
  hasImageProvider,
  hasVideoProvider,
  hasAudioProvider,
} from "./registry";

// Text provider implementations
export { createHuggingFaceTextProvider } from "./text";
export { createGeminiTextProvider } from "./gemini";

// Image provider implementations
export { createPollinationsImageProvider } from "./image";

// Audio provider implementations
export { createMsEdgeTtsAudioProvider } from "./audio";

// Video provider implementations
export { createFfmpegVideoProvider } from "./video";

// Factory entry points
export { createTextProvider, createAudioProvider, createVideoProvider } from "./factory";
