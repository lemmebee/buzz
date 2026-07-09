import { eq } from "drizzle-orm";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { buildFluxPrompt } from "@/lib/brain/imagePromptBuilder";
import type { ImagePrompt } from "@/lib/brain/types";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import { resolveTextProvider, resolveImageProvider } from "@/lib/providers";
import { classifyProviderError, isTerminalProviderError } from "@/lib/providers/errors";
import { getImageStyle } from "@/lib/settings";
import type { ContentConfig } from "@/lib/content/defaults";
import { prepareImages } from "@/lib/images";
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

function derivePalette(colors: string | undefined): { bg: string; accent: string; text: string } {
  const hexes = (colors?.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase());
  const accent = hexes[0] ?? "#ffd60a";
  const bg = hexes[1] ?? "#0b0b0f";
  return { bg, accent, text: "#ffffff" };
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

// Save base64 images to public/media/ and return their staticFile-relative paths
function saveUploadedImages(images: string[]): string[] {
  const mediaDir = join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });
  const paths: string[] = [];
  for (const base64 of images) {
    const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const fsPath = join(mediaDir, filename);
    writeFileSync(fsPath, Buffer.from(base64, "base64"));
    paths.push(`media/${filename}`);
  }
  return paths;
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
  const imageStyle = await getImageStyle();

  const logoImages = product.logo
    ? await prepareImages([product.logo], { maxImages: 1, maxWidth: 512, maxHeight: 512, quality: 80 })
    : [];
  const allImages = [...logoImages.map((l) => l.base64), ...images];
  const hasLogo = logoImages.length > 0;

  const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
    rawProfile, rawStrategy, images.length, platform, targetSurface, targeting, accountHandle, product.name, product.llmInstructions || undefined, imageStyle, hasLogo
  );

  const styleReminder = `\n\nREMINDER: Write like a real human. NEVER use em dashes (—), NEVER use AI cliché words (elevate, unlock, unleash, seamlessly, revolutionize, empower, leverage, game-changer, cutting-edge, next-level). Use casual, imperfect language. Be specific, not generic.`;
  const userPrompt = generateCount > 1
    ? `Generate ${generateCount} unique variations. Return valid JSON array: [{"caption": "...", "hashtags": [...], "imagePrompt": {...}}, ...]${styleReminder}`
    : `Generate the content now. Return valid JSON only.${styleReminder}`;

  const textResult = await textProvider.generate({
    systemPrompt,
    userPrompt,
    images: allImages.length > 0 ? allImages : undefined,
    maxTokens: 4096 * generateCount,
    temperature: 0.9,
  });

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

  // Gather assets for the creative director
  const productShots: string[] = (() => {
    try {
      const arr = JSON.parse(product.screenshots || "[]");
      return Array.isArray(arr)
        ? arr.map((s: unknown) => String(s).replace(/^\/api\/media\//, "media/")).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  })();

  // Save user uploads to disk so Remotion can use them
  const uploadedImagePaths = images.length > 0 ? saveUploadedImages(images) : [];

  const vibe =
    [profile.visualIdentity?.mood, profile.visualIdentity?.style, marketingStrategy.visualDirection]
      .filter(Boolean)
      .join("; ") || "modern, bold, on-brand";

  const visualIdentity = profile.visualIdentity;
  const visualDirection = marketingStrategy.visualDirection;
  const imageProvider = await resolveImageProvider(product.imageProvider);
  const aspectRatio = config.aspectRatio || "1:1";
  const dims = aspectRatioToDims(aspectRatio);

  const buildCreativeImage = async (item: ImageGenerated): Promise<GeneratedPost | null> => {
    const captionText = coerceText(item.caption).trim() || product.name;

    const { renderBestImage } = await import("@/lib/image/select");

    console.log(
      `[image] authoring via ${textProvider.name}, productShots=${productShots.length}, uploads=${uploadedImagePaths.length}`
    );

    const r = await renderBestImage({
      textProvider,
      productName: product.name,
      profile: rawProfile,
      strategy: rawStrategy,
      vibe,
      aspectRatio,
      productShots: productShots.length,
      uploadedImages: uploadedImagePaths.length,
      caption: captionText,
      fallbackPalette: derivePalette(profile.visualIdentity?.colors),
      n: 3,
      renderOpts: {
        imageProviderName: product.imageProvider,
        productShots,
        uploadedImages: uploadedImagePaths,
        productName: product.name,
      },
    });

    return {
      content: sanitizeCaption(captionText),
      hashtags: (item.hashtags || []).map((t) => coerceText(t).replace(/^#+/, "")),
      mediaUrl: r.url,
      publicMediaUrl: r.url,
      config,
      metadata,
    };
  };

  const buildFluxImage = async (item: ImageGenerated): Promise<GeneratedPost> => {
    const captionText = coerceText(item.caption).trim() || product.name;
    const fluxPrompt = buildFluxPrompt({
      imagePrompt: item.imagePrompt || { scene: captionText, aspectRatio },
      visualIdentity,
      visualDirection,
    });
    console.log("[image] Flux prompt:", fluxPrompt.slice(0, 120));

    const imageResult = await imageProvider.generate({
      prompt: fluxPrompt,
      width: dims.w,
      height: dims.h,
    });

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
      let post: GeneratedPost | null = null;

      // Try creative director first
      try {
        post = await buildCreativeImage(generatedItems[i]);
        if (post) {
          console.log(`[image] variation ${i + 1}: creative director succeeded`);
        }
      } catch (err) {
        console.warn(
          `[image] variation ${i + 1}: creative director failed, falling back to Flux: ${err instanceof Error ? err.message : err}`
        );
      }

      // Fall back to Flux if creative director failed
      if (!post) {
        post = await buildFluxImage(generatedItems[i]);
        console.log(`[image] variation ${i + 1}: Flux fallback succeeded`);
      }

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
