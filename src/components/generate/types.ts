export type PlatformType = "instagram" | "twitter";
export type ContentType = "reel" | "post" | "story" | "ad";
export type MediaTypeUi = "image" | "video";

export interface FormConfig {
  durationSec?: number;
  aspectRatio: string;
  captions?: boolean;
  videoStyle?: "scenes" | "typography" | "creative";
}

export const CONFIG_DEFAULTS: Record<ContentType, Record<MediaTypeUi, FormConfig>> = {
  reel: {
    video: { durationSec: 15, aspectRatio: "9:16", captions: true },
    image: { aspectRatio: "9:16" },
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

export const ASPECT_OPTIONS = ["1:1", "9:16", "4:5", "16:9"];

export interface GeneratedPost {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  publicMediaUrl?: string | null;
  metadata?: {
    hookUsed?: string;
    pillarUsed?: string;
    targetType?: string;
    targetValue?: string;
    toneConstraints?: string[];
    visualDirection?: string;
  };
}

export interface Suggestions {
  suggestedHook: string | null;
  suggestedPillar: string | null;
  suggestedPain: string | null;
  suggestedDesire: string | null;
  suggestedObjection: string | null;
  usageStats: {
    hooks: Record<string, number>;
    pillars: Record<string, number>;
    pains: Record<string, number>;
    desires: Record<string, number>;
    objections: Record<string, number>;
  };
  available: {
    hooks: string[];
    pillars: string[];
    pains: string[];
    desires: string[];
    objections: { objection: string; counter: string }[];
  };
}

export const contentTypesByPlatform: Record<PlatformType, { value: ContentType; label: string }[]> = {
  instagram: [
    { value: "post", label: "Post" },
    { value: "reel", label: "Reel" },
    { value: "story", label: "Story" },
    { value: "ad", label: "Ad" },
  ],
  twitter: [
    { value: "post", label: "Tweet" },
    { value: "ad", label: "Ad" },
  ],
};
