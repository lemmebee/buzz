import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { buildFluxPrompt } from "@/lib/brain/imagePromptBuilder";
import type { Platform, ContentPurpose, ContentTargeting, ImagePrompt, GenerationMetadata, MediaType } from "@/lib/brain/types";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import { createTextProvider, createPollinationsImageProvider } from "@/lib/providers";
import { getTextProvider } from "@/lib/settings";
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

export function sanitizeCaption(text: string): string {
  let s = text;
  s = s.replace(/—/g, ",");
  s = s.replace(/–/g, "-");
  const cliches = /\b(elevate|unlock|dive into|unleash|game.?changer|seamlessly|revolutionize|empower|leverage|cutting.?edge|next.?level)\b/gi;
  s = s.replace(cliches, () => "");
  s = s.replace(/ {2,}/g, " ").replace(/ ([,.])/g, "$1").trim();
  return s;
}

export async function generateContent(input: GenerateContentInput): Promise<GeneratedPost[]> {
  const { productId, platform, mediaType, targetSurface, config: userConfig, targeting, count = 1, images = [] } = input;
  const generateCount = Math.min(Math.max(count, 1), 10);
  const config: ContentConfig = { ...getDefaults(targetSurface, mediaType), ...(userConfig || {}) };

  if (mediaType === "video") {
    const { generateVideoContent } = await import("@/lib/video/orchestrator");
    return generateVideoContent({ ...input, config });
  }

  const contentType = targetSurface;

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) throw new Error("Product not found");
  if (!product.profile || !product.marketingStrategy) {
    throw new Error("Product missing profile or marketingStrategy");
  }

  const rawProfile = JSON.parse(product.profile);
  const rawStrategy = JSON.parse(product.marketingStrategy);
  const profile = normalizeProfile(rawProfile);
  const marketingStrategy = normalizeStrategy(rawStrategy);

  let accountHandle: string | undefined;
  if (product.instagramAccountId) {
    const igAccount = await db.query.instagramAccounts.findFirst({
      where: eq(schema.instagramAccounts.id, product.instagramAccountId),
    });
    if (igAccount?.username) accountHandle = `@${igAccount.username}`;
  }

  const textProvider = createTextProvider(product.textProvider || await getTextProvider());
  const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
    rawProfile, rawStrategy, images.length, platform, contentType, targeting, accountHandle, product.name
  );

  const styleReminder = `\n\nREMINDER: Write like a real human. NEVER use em dashes (—), NEVER use AI cliché words (elevate, unlock, unleash, seamlessly, revolutionize, empower, leverage, game-changer, cutting-edge, next-level). Use casual, imperfect language. Be specific, not generic.`;
  const userPrompt = generateCount > 1
    ? `Generate ${generateCount} unique variations. Return valid JSON array: [{"caption": "...", "hashtags": [...], "imagePrompt": {...}}, ...]${styleReminder}`
    : `Generate the content now. Return valid JSON only.${styleReminder}`;

  const textResult = await textProvider.generate({
    systemPrompt,
    userPrompt,
    images: images.length > 0 ? images : undefined,
    maxTokens: 4096 * generateCount,
    temperature: 0.9,
  });

  const cleanedText = textResult.text.replace(/```(?:json)?\s*/gi, "").trim();

  let generatedItems: Array<{ caption: string; hashtags?: string[]; imagePrompt?: ImagePrompt }>;
  if (generateCount > 1) {
    const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Failed to parse array response");
    generatedItems = JSON.parse(arrayMatch[0]);
  } else {
    const objMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Failed to parse response");
    generatedItems = [JSON.parse(objMatch[0])];
  }

  const posts: GeneratedPost[] = [];
  const ENABLE_IMAGE_GENERATION = true;
  const visualIdentity = profile.visualIdentity;
  const visualDirection = marketingStrategy.visualDirection;

  for (const generated of generatedItems) {
    let mediaUrl: string | null = null;
    let publicMediaUrl: string | null = null;
    if (ENABLE_IMAGE_GENERATION && generated.imagePrompt?.scene) {
      const imageProvider = createPollinationsImageProvider();
      const aspectRatio = generated.imagePrompt.aspectRatio || "1:1 square";
      const isVertical = aspectRatio.includes("9:16");

      const fluxPrompt = buildFluxPrompt({
        imagePrompt: generated.imagePrompt,
        visualIdentity,
        visualDirection,
      });
      console.log("[Flux prompt]", fluxPrompt);

      const imageResult = await imageProvider.generate({
        prompt: fluxPrompt,
        width: isVertical ? 768 : 1024,
        height: isVertical ? 1365 : 1024,
      });
      mediaUrl = imageResult.localPath || imageResult.url;
      publicMediaUrl = imageResult.url;
    }

    posts.push({
      content: sanitizeCaption(generated.caption),
      hashtags: (generated.hashtags || []).map((t) => t.replace(/^#+/, "")),
      mediaUrl,
      publicMediaUrl,
      config,
      metadata,
    });
  }

  if (posts.length === 0) throw new Error("Failed to generate any content");
  return posts;
}
