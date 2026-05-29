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
  SceneRenderInput,
  SceneRenderOutput,
  SceneRenderer,
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
  registerSceneRenderer,
  getSceneRenderer,
  hasSceneRenderer,
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

// Scene renderer implementations
export { createSatoriResvgRenderer } from "../compose/render/satoriResvg";

// Factory entry points
export { createTextProvider, createAudioProvider, createVideoProvider, createSceneRenderer } from "./factory";
