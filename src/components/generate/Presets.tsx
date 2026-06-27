"use client";

import { Sparkles, Image as ImageIcon, Video, Zap } from "lucide-react";
import type { PlatformType, ContentType, MediaTypeUi } from "./types";

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  config: {
    platform: PlatformType;
    mediaType: MediaTypeUi;
    contentType: ContentType;
    count: number;
    aspectRatio: string;
    durationSec?: number;
    captions?: boolean;
  };
}

export const presets: Preset[] = [
  {
    id: "quick-post",
    name: "Quick Post",
    description: "Single image post, auto-targeting",
    icon: Zap,
    config: {
      platform: "instagram",
      mediaType: "image",
      contentType: "post",
      count: 3,
      aspectRatio: "1:1",
    },
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    description: "Highlight product features",
    icon: Sparkles,
    config: {
      platform: "instagram",
      mediaType: "image",
      contentType: "post",
      count: 5,
      aspectRatio: "1:1",
    },
  },
  {
    id: "story-batch",
    name: "Story Batch",
    description: "Vertical stories for engagement",
    icon: ImageIcon,
    config: {
      platform: "instagram",
      mediaType: "image",
      contentType: "story",
      count: 5,
      aspectRatio: "9:16",
    },
  },
  {
    id: "reel-set",
    name: "Reel Set",
    description: "Video reels with captions",
    icon: Video,
    config: {
      platform: "instagram",
      mediaType: "video",
      contentType: "reel",
      count: 3,
      aspectRatio: "9:16",
      durationSec: 15,
      captions: true,
    },
  },
];

interface PresetsProps {
  onApply: (preset: Preset) => void;
}

export function Presets({ onApply }: PresetsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-text-primary mb-3">Quick Presets</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              onClick={() => onApply(preset)}
              className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-background"
            >
              <Icon className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium text-text-primary">{preset.name}</div>
                <div className="text-xs text-text-tertiary">{preset.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
