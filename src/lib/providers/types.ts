// Base provider interface
export interface Provider<TInput, TOutput> {
  name: string;
  generate(input: TInput): Promise<TOutput>;
}

// Text generation
export interface TextGenerationInput {
  systemPrompt: string;
  userPrompt: string;
  images?: string[];
  maxTokens?: number;
  temperature?: number;
}

export interface TextGenerationOutput {
  text: string;
  imagePrompt?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type TextProvider = Provider<TextGenerationInput, TextGenerationOutput>;

// Image generation (stub for future)
export interface ImageGenerationInput {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface ImageGenerationOutput {
  url: string;
  localPath?: string;
}

export type ImageProvider = Provider<ImageGenerationInput, ImageGenerationOutput>;

// Video generation
export interface SceneSpec {
  imagePath: string; // absolute filesystem path to a still
  durationSec: number;
}

export interface VideoGenerationInput {
  prompt?: string;
  scenes: SceneSpec[];
  audioPath: string; // absolute filesystem path to narration mp3
  captionsPath?: string; // absolute filesystem path to SRT
  durationSec: number;
  aspectRatio: string; // "9:16" | "1:1" | "16:9" | "4:5"
}

export interface VideoGenerationOutput {
  url: string;
  localPath?: string;
  duration?: number;
}

export type VideoProvider = Provider<VideoGenerationInput, VideoGenerationOutput>;

// Audio generation (stub for future)
export interface AudioGenerationInput {
  script: string;
  voice?: string;
  speed?: number;
}

export interface AudioGenerationOutput {
  url: string;
  localPath?: string;
  duration?: number;
}

export type AudioProvider = Provider<AudioGenerationInput, AudioGenerationOutput>;

// Provider config
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
