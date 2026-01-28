export interface ProductPlan {
  name: string;
  description: string;
  features: string[];
  audience: string;
  tone: string;
  themes: string[];
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
