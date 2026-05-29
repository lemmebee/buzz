import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import type { Platform, ContentPurpose, ContentTargeting, GenerationMetadata, MediaType } from "@/lib/brain/types";
import { createTextProvider, getSceneRenderer, createSceneRenderer, fetchBackgroundImage } from "@/lib/providers";
import type { SceneRenderer } from "@/lib/providers";
import { getTextProvider } from "@/lib/settings";
import { getDefaults, type ContentConfig } from "@/lib/content/defaults";
import { briefSchema } from "@/lib/brain/briefSchema";
import { getCachedBrandKit, deriveBrandKit } from "@/lib/brain/brandkit";
import { ARCHETYPES, type Brief } from "@/lib/compose/archetypes";
import { resolveFont } from "@/lib/compose/fonts";
import type { Scene, Background } from "@/lib/compose/scene";

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
  scene?: Scene | null;
  metadata: GenerationMetadata;
}

/**
 * Resolve the scene renderer. Prefers a renderer registered at app bootstrap
 * (see src/instrumentation.ts); falls back to constructing one directly so the
 * pipeline still works in non-Next runtimes (CLI scripts, one-off jobs).
 */
function resolveSceneRenderer(): SceneRenderer {
  try {
    return getSceneRenderer();
  } catch {
    return createSceneRenderer();
  }
}

/**
 * Swap the photo placeholder for a real local image. The background-image case and the
 * image-element case (e.g. photoCaption) both seed `src` with the LLM prompt text; replace
 * exactly those occurrences so unrelated images (logos, brand art) are left untouched.
 */
function patchPhotoSlot(
  scene: Scene,
  placeholder: string,
  localPath: string,
  treatment: "none" | "warm" | "duotone"
): void {
  if (scene.background.kind === "image" && scene.background.src === placeholder) {
    scene.background = { kind: "image", src: localPath, fit: scene.background.fit, treatment };
  }
  for (const el of scene.elements) {
    if (el.type === "image" && el.src === placeholder) {
      el.src = localPath;
    }
  }
}

/**
 * Imagery failed: replace the photo background with a gradient and scrub any image element
 * still carrying the prompt-text placeholder (drop its src so the empty-src guard skips it).
 * Guarantees no post ships with prompt text as an image src.
 */
function scrubPhotoPlaceholder(scene: Scene, placeholder: string, gradient: Background): void {
  if (scene.background.kind === "image" && scene.background.src === placeholder) {
    scene.background = gradient;
  }
  for (const el of scene.elements) {
    if (el.type === "image" && el.src === placeholder) {
      el.src = "";
    }
  }
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

  let briefs: Brief[];
  if (generateCount > 1) {
    const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Failed to parse array response");
    briefs = (JSON.parse(arrayMatch[0]) as unknown[]).map((b) => briefSchema.parse(b));
  } else {
    const objMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Failed to parse response");
    briefs = [briefSchema.parse(JSON.parse(objMatch[0]))];
  }

  const kit = getCachedBrandKit(product) || (await deriveBrandKit(productId));

  // Resolve the two brand fonts once; reused across every brief in this batch.
  const displaySpec = kit.type.display;
  const bodySpec = kit.type.body;
  const [displayFont, bodyFont] = await Promise.all([
    resolveFont(displaySpec.family, displaySpec.class, displaySpec.weights[0]),
    resolveFont(bodySpec.family, bodySpec.class, bodySpec.weights[0]),
  ]);
  const fonts = [
    { name: displayFont.family, data: displayFont.data, weight: displayFont.weight },
    { name: bodyFont.family, data: bodyFont.data, weight: bodyFont.weight },
  ];

  const renderer = resolveSceneRenderer();
  const posts: GeneratedPost[] = [];

  for (const brief of briefs) {
    const scene = ARCHETYPES[brief.archetype](kit, brief);

    // Photo imagery: archetypes seed the photo slot with the LLM prompt text
    // (brief.imagery.scene) as a placeholder src. Fetch a real local image and swap it
    // wherever the chosen archetype placed the photo (background-image OR an image element
    // carrying the placeholder). On any failure, degrade to a brand gradient AND scrub the
    // placeholder so no post ever ships with prompt text as an image src.
    if (brief.imagery.kind === "photo" && brief.imagery.scene) {
      const placeholder = brief.imagery.scene;
      try {
        const { localPath } = await fetchBackgroundImage(placeholder, {
          treatment: kit.photo.treatment,
        });
        // fetchBackgroundImage bakes the treatment into the pixels; pass "none" so the
        // satori overlay layer isn't applied a second time on top.
        patchPhotoSlot(scene, placeholder, localPath, "none");
      } catch (err) {
        console.error("[generate] imagery failed, falling back to gradient:", err);
        const gradient: Background = {
          kind: "gradient",
          from: kit.palette.bg,
          to: kit.palette.surface,
          angle: 145,
        };
        scrubPhotoPlaceholder(scene, placeholder, gradient);
      }
    }

    // Render: on failure, keep the (editable) scene but write no broken PNG.
    let mediaUrl: string | null = null;
    let publicMediaUrl: string | null = null;
    try {
      const rendered = await renderer.generate({ scene, fonts });
      mediaUrl = rendered.localPath || rendered.url;
      publicMediaUrl = rendered.url;
    } catch (err) {
      console.error("[generate] render failed, persisting scene without PNG:", err);
    }

    posts.push({
      content: sanitizeCaption(brief.caption),
      hashtags: (brief.hashtags || []).map((t) => t.replace(/^#+/, "")),
      mediaUrl,
      publicMediaUrl,
      config,
      scene,
      metadata,
    });
  }

  if (posts.length === 0) throw new Error("Failed to generate any content");
  return posts;
}
