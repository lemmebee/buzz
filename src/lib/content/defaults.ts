import type { ContentPurpose, MediaType } from "@/lib/brain/types";

export interface ContentConfig {
  durationSec?: number;
  aspectRatio: string;
  captions?: boolean;
}

type DefaultsMap = {
  [S in ContentPurpose]?: { [M in MediaType]?: ContentConfig };
};

const DEFAULTS: DefaultsMap = {
  reel: {
    video: { durationSec: 15, aspectRatio: "9:16", captions: true },
  },
  post: {
    image: { aspectRatio: "1:1" },
    video: { durationSec: 30, aspectRatio: "1:1", captions: false },
  },
  story: {
    image: { aspectRatio: "9:16" },
    video: { durationSec: 15, aspectRatio: "9:16", captions: false },
  },
  ad: {
    image: { aspectRatio: "1:1" },
    video: { durationSec: 15, aspectRatio: "1:1", captions: true },
  },
};

const FALLBACK: ContentConfig = { aspectRatio: "1:1" };

export function getDefaults(targetSurface: ContentPurpose, mediaType: MediaType): ContentConfig {
  const surfaceMap = DEFAULTS[targetSurface];
  if (!surfaceMap) return { ...FALLBACK };
  const cfg = surfaceMap[mediaType];
  if (!cfg) return { ...FALLBACK };
  return { ...cfg };
}

export function isValidCombo(targetSurface: ContentPurpose, mediaType: MediaType): boolean {
  if (targetSurface === "reel" && mediaType === "image") return false;
  return true;
}
