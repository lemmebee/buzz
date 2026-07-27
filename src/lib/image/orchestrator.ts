import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { buildFluxPrompt } from "@/lib/brain/imagePromptBuilder";
import type { ImagePrompt } from "@/lib/brain/types";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import { resolveTextProvider, resolveImageProvider } from "@/lib/providers";
import { classifyProviderError, isTerminalProviderError } from "@/lib/providers/errors";
import { getContentMaxImages } from "@/lib/settings";
import type { ContentConfig } from "@/lib/content/defaults";
import { prepareImages } from "@/lib/images";
import { timed } from "@/lib/traces";
import {
  sanitizeCaption,
  type GenerateContentInput,
  type GeneratedPost,
  type GenerateContentResult,
  type GenerationFailure,
  type GenerationHooks,
} from "@/lib/generate";

interface ImageGenerated {
  caption: string;
  hashtags?: string[];
  imagePrompt?: ImagePrompt;
}

function coerceText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(coerceText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    return Object.values(obj).map(coerceText).filter(Boolean).join(" ");
  }
  return "";
}

function aspectRatioToDims(ratio: string): { w: number; h: number } {
  switch (ratio) {
    case "9:16": return { w: 1080, h: 1920 };
    case "16:9": return { w: 1920, h: 1080 };
    case "4:5": return { w: 1080, h: 1350 };
    case "1:1":
    default: return { w: 1080, h: 1080 };
  }
}

export async function generateImageContent(
  input: GenerateContentInput & { config: ContentConfig },
  hooks?: GenerationHooks
): Promise<GenerateContentResult> {
  const { productId, platform, targetSurface, config, targeting, count = 1, images = [] } = input;
  const generateCount = Math.min(Math.max(count, 1), 10);

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

  const textProvider = await resolveTextProvider(product.textProvider);

  const logoImages = product.logo
    ? await prepareImages([product.logo], { maxImages: 1, maxWidth: 512, maxHeight: 512, quality: 80 })
    : [];
  const contentMaxImages = await getContentMaxImages();
  const allImages = [...logoImages.map((l) => l.base64), ...images.slice(0, contentMaxImages)];
  const hasLogo = logoImages.length > 0;

  const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
    rawProfile, rawStrategy, images.length, platform, targetSurface, targeting, accountHandle, product.name, product.llmInstructions || undefined, undefined, hasLogo
  );

  const styleReminder = `\n\nREMINDER: Write like a real human. NEVER use em dashes (—), NEVER use AI cliché words (elevate, unlock, unleash, seamlessly, revolutionize, empower, leverage, game-changer, cutting-edge, next-level). Use casual, imperfect language. Be specific, not generic.`;
  const userPrompt = generateCount > 1
    ? `Generate ${generateCount} unique variations. Return valid JSON array: [{"caption": "...", "hashtags": [...], "imagePrompt": {...}}, ...]${styleReminder}`
    : `Generate the content now. Return valid JSON only.${styleReminder}`;

  const textResult = await timed(
    {
      productId,
      phase: "prompt",
      step: "content-authoring",
      engine: "buzz",
      provider: textProvider.name,
      model: textProvider.name,
      input: JSON.stringify({
        systemPrompt,
        userPrompt,
        platform,
        targetSurface,
        variations: generateCount,
        imagesAttached: allImages.length,
        hasLogo,
        assetsSent: product.logo ? [product.logo] : [],
        uploadsAttached: images.length,
      }),
    },
    () =>
      textProvider.generate({
        systemPrompt,
        userPrompt,
        images: allImages.length > 0 ? allImages : undefined,
        maxTokens: 4096 * generateCount,
        temperature: 0.9,
      }),
    (r) => ({ text: r.text })
  );

  const cleanedText = textResult.text.replace(/```(?:json)?\s*/gi, "").trim();

  let generatedItems: ImageGenerated[];
  if (generateCount > 1) {
    const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Failed to parse image array response");
    generatedItems = JSON.parse(arrayMatch[0]);
  } else {
    const objMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Failed to parse image response");
    generatedItems = [JSON.parse(objMatch[0])];
  }

  const visualIdentity = profile.visualIdentity;
  const visualDirection = marketingStrategy.visualDirection;
  const imageProvider = await resolveImageProvider(product.imageProvider);
  const aspectRatio = config.aspectRatio || "1:1";
  const dims = aspectRatioToDims(aspectRatio);

  const buildImage = async (item: ImageGenerated): Promise<GeneratedPost> => {
    const captionText = coerceText(item.caption).trim() || product.name;
    const fluxPrompt = buildFluxPrompt({
      imagePrompt: item.imagePrompt || { scene: captionText, aspectRatio },
      visualIdentity,
      visualDirection,
    });
    console.log("[image] Flux prompt:", fluxPrompt.slice(0, 120));

    const imageResult = await timed(
      {
        productId,
        phase: "generate",
        step: "flux-fallback",
        engine: "buzz",
        provider: imageProvider.name,
        model: imageProvider.name,
        input: JSON.stringify({ prompt: fluxPrompt, width: dims.w, height: dims.h }),
      },
      () =>
        imageProvider.generate({
          prompt: fluxPrompt,
          width: dims.w,
          height: dims.h,
        })
    );

    return {
      content: sanitizeCaption(captionText),
      hashtags: (item.hashtags || []).map((t) => coerceText(t).replace(/^#+/, "")),
      mediaUrl: imageResult.localPath || imageResult.url,
      publicMediaUrl: imageResult.url,
      config,
      metadata,
    };
  };

  const posts: GeneratedPost[] = [];
  const errors: GenerationFailure[] = [];

  for (let i = 0; i < generatedItems.length; i++) {
    if (await hooks?.shouldCancel?.()) {
      console.log(`[image] cancel requested — stopping after ${posts.length}/${generatedItems.length}`);
      break;
    }
    try {
      const post = await buildImage(generatedItems[i]);
      posts.push(post);
      await hooks?.onPost?.(posts, errors);
    } catch (err) {
      const terminal = isTerminalProviderError(err);
      console.error(
        `[image] variation ${i + 1}/${generatedItems.length} failed:`,
        err instanceof Error ? err.message : err
      );
      errors.push({ index: i, message: classifyProviderError(err), terminal });
      await hooks?.onPost?.(posts, errors);
      if (terminal) break;
    }
  }

  return { posts, errors };
}
