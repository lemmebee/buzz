import type { BrandKit } from "@/lib/brain/brandkit";
import type { Scene } from "@/lib/compose/scene";

export type ArchetypeId =
  | "editorial" | "displayImage" | "photoCaption" | "iconCard" | "quote"
  | "stat" | "steps" | "feature" | "announce" | "article";

export interface Brief {
  archetype: ArchetypeId;
  headline: string;
  subhead?: string;
  body?: string;
  imagery: { kind: "photo" | "gradient" | "solid"; scene?: string };
  accentIndex: number;
  caption: string;
  hashtags: string[];
}

export type ArchetypeBuilder = (kit: BrandKit, brief: Brief) => Scene;

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  "editorial", "displayImage", "photoCaption", "iconCard", "quote",
  "stat", "steps", "feature", "announce", "article",
] as const;
