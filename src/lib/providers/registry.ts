import type { TextProvider, ImageProvider, VideoProvider, AudioProvider } from "./types";

interface ProviderRegistry {
  text: TextProvider | null;
  image: ImageProvider | null;
  video: VideoProvider | null;
  audio: AudioProvider | null;
}

const registry: ProviderRegistry = {
  text: null,
  image: null,
  video: null,
  audio: null,
};

export function registerTextProvider(provider: TextProvider): void {
  registry.text = provider;
}

export function registerImageProvider(provider: ImageProvider): void {
  registry.image = provider;
}

export function registerVideoProvider(provider: VideoProvider): void {
  registry.video = provider;
}

export function registerAudioProvider(provider: AudioProvider): void {
  registry.audio = provider;
}

export function getTextProvider(): TextProvider {
  if (!registry.text) {
    throw new Error("No text provider registered");
  }
  return registry.text;
}

export function getImageProvider(): ImageProvider {
  if (!registry.image) {
    throw new Error("No image provider registered");
  }
  return registry.image;
}

export function getVideoProvider(): VideoProvider {
  if (!registry.video) {
    throw new Error("No video provider registered");
  }
  return registry.video;
}

export function getAudioProvider(): AudioProvider {
  if (!registry.audio) {
    throw new Error("No audio provider registered");
  }
  return registry.audio;
}

export function hasTextProvider(): boolean {
  return registry.text !== null;
}

export function hasImageProvider(): boolean {
  return registry.image !== null;
}

export function hasVideoProvider(): boolean {
  return registry.video !== null;
}

export function hasAudioProvider(): boolean {
  return registry.audio !== null;
}
