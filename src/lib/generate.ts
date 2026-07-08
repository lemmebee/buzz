import type { Platform, ContentPurpose, ContentTargeting, GenerationMetadata, MediaType } from "@/lib/brain/types";
import { getDefaults, type ContentConfig } from "@/lib/content/defaults";

export interface GenerateContentInput {
  productId: number;
  platform: Platform;
  mediaType: MediaType;
  targetSurface: ContentPurpose;
  config?: Partial<ContentConfig>;
  targeting?: ContentTargeting;
  count?: number;
  images?: string[]; // base64 screenshots
}

export interface GeneratedPost {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  publicMediaUrl?: string | null;
  script?: string | null;
  duration?: number | null;
  audioUrl?: string | null;
  captionsUrl?: string | null;
  config?: ContentConfig;
  metadata: GenerationMetadata;
}

export interface GenerationFailure {
  index: number; // 0-based variation that failed
  message: string; // user-friendly, classified
  terminal: boolean; // true if it stopped the rest of the batch (quota/credits/auth)
}

export interface GenerateContentResult {
  posts: GeneratedPost[];
  errors: GenerationFailure[];
}

// Optional hooks so callers can stream partial results and cancel mid-batch.
// onPost fires after each variation finishes (with the full accumulated arrays
// so far). shouldCancel is polled before each variation; returning true stops
// the batch and returns whatever finished — already-generated posts are kept.
export interface GenerationHooks {
  onPost?: (posts: GeneratedPost[], errors: GenerationFailure[]) => void | Promise<void>;
  shouldCancel?: () => boolean | Promise<boolean>;
}

export function sanitizeCaption(text: string): string {
  let s = text;
  s = s.replace(/—/g, ",");
  s = s.replace(/–/g, "-");
  const cliches = /\b(elevate|unlock|dive into|unleash|game.?changer|seamlessly|revolutionize|empower|leverage|cutting.?edge|next.?level)\b/gi;
  s = s.replace(cliches, () => "");
  s = s.replace(/ {2,}/g, " ").replace(/ ([,.])/g, "$1").trim();
  return s;
}

export async function generateContent(
  input: GenerateContentInput,
  hooks?: GenerationHooks
): Promise<GenerateContentResult> {
  const { mediaType, targetSurface, config: userConfig } = input;
  const config: ContentConfig = { ...getDefaults(targetSurface, mediaType), ...(userConfig || {}) };

  if (mediaType === "video") {
    const { generateVideoContent } = await import("@/lib/video/orchestrator");
    return generateVideoContent({ ...input, config }, hooks);
  }

  const { generateImageContent } = await import("@/lib/image/orchestrator");
  return generateImageContent({ ...input, config }, hooks);
}
