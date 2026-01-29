export interface ProductPlan {
  name: string;
  description: string;
  audience: string;
  tone: string;
  visualStyle?: string;
}

export type Platform = "instagram" | "tiktok" | "youtube";
export type ContentPurpose = "reel" | "post" | "story" | "carousel" | "ad";
export type MediaType = "image" | "video" | "audio";

export interface GenerationInput {
  product: ProductPlan;
  platform: Platform;
  purpose: ContentPurpose;
  mediaType: MediaType;
}

export interface GeneratedMedia {
  url: string;
  localPath?: string;
  type: MediaType;
}

export interface GeneratedText {
  caption: string;
  hashtags: string[];
  description?: string;
  script?: string;
}

export interface GenerationOutput {
  media: GeneratedMedia;
  text: GeneratedText;
}

// Targeting types
export type TargetType = "pain" | "desire" | "objection";

export interface ContentTargeting {
  hook?: string;
  pillar?: string;
  targetType?: TargetType;
  targetValue?: string;
}

export interface GenerationMetadata {
  hookUsed: string | null;
  pillarUsed: string | null;
  targetType: TargetType | null;
  targetValue: string | null;
  toneConstraints: string[];
  visualDirection: string;
}

export interface MarketingStrategy {
  hooks: string[];
  themes: string[];
  contentPillars: string[];
  painPoints: string[];
  desirePoints: string[];
  objections: { objection: string; counter: string }[];
  toneGuidelines: string;
  visualDirection: string;
}
