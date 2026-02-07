import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import { buildFluxPrompt } from "@/lib/brain/imagePromptBuilder";
import type { Platform, ContentPurpose, ContentTargeting, ImagePrompt } from "@/lib/brain/types";
import { normalizeProfile, normalizeStrategy } from "@/lib/brain/types";
import { createTextProvider, createPollinationsImageProvider } from "@/lib/providers";
import { getTextProvider } from "@/lib/settings";

function sanitizeCaption(text: string): string {
  let s = text;
  // Replace em dashes with commas
  s = s.replace(/—/g, ",");
  // Replace en dashes with hyphens
  s = s.replace(/–/g, "-");
  // Strip AI cliché words/phrases
  const cliches = /\b(elevate|unlock|dive into|unleash|game.?changer|seamlessly|revolutionize|empower|leverage|cutting.?edge|next.?level)\b/gi;
  s = s.replace(cliches, (match) => {
    // Remove the word and clean up extra spaces
    return "";
  });
  // Clean up double spaces and spaces before punctuation
  s = s.replace(/ {2,}/g, " ").replace(/ ([,.])/g, "$1").trim();
  return s;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const body = JSON.parse(formData.get("data") as string);
  const { productId, platform, contentType, targeting, count = 1 } = body as {
    productId: number;
    platform: Platform;
    contentType: ContentPurpose;
    targeting?: ContentTargeting;
    count?: number;
  };
  const generateCount = Math.min(Math.max(count, 1), 10); // clamp 1-10

  if (!productId || !platform || !contentType) {
    return NextResponse.json({ error: "productId, platform, and contentType required" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.profile || !product.marketingStrategy) {
    return NextResponse.json({ error: "Product missing profile or marketingStrategy. Upload a brief first." }, { status: 400 });
  }

  const rawProfile = JSON.parse(product.profile);
  const rawStrategy = JSON.parse(product.marketingStrategy);
  const profile = normalizeProfile(rawProfile);
  const marketingStrategy = normalizeStrategy(rawStrategy);
  // Fetch linked Instagram account username
  let accountHandle: string | undefined;
  if (product.instagramAccountId) {
    const igAccount = await db.query.instagramAccounts.findFirst({
      where: eq(schema.instagramAccounts.id, product.instagramAccountId),
    });
    if (igAccount?.username) {
      accountHandle = `@${igAccount.username}`;
    }
  }

  // Load fresh uploaded screenshots as base64 (product screenshots already extracted into profile)
  const images: string[] = [];
  const uploadedFiles = formData.getAll("screenshots") as File[];
  for (const file of uploadedFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push(buffer.toString("base64"));
  }

  try {
    const textProvider = createTextProvider(product.textProvider || await getTextProvider());
    const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
      rawProfile,
      rawStrategy,
      images.length,
      platform,
      contentType,
      targeting,
      accountHandle,
      product.name
    );

    // Ask for multiple posts in one LLM call
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

    // Strip markdown code fences before parsing
    const cleanedText = textResult.text.replace(/```(?:json)?\s*/gi, "").trim();

    // Parse response - could be array or single object
    let generatedItems: Array<{ caption: string; hashtags?: string[]; imagePrompt?: ImagePrompt }>;

    if (generateCount > 1) {
      const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        throw new Error("Failed to parse array response");
      }
      generatedItems = JSON.parse(arrayMatch[0]);
    } else {
      const objMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (!objMatch) {
        throw new Error("Failed to parse response");
      }
      generatedItems = [JSON.parse(objMatch[0])];
    }

    // Process each generated item - return for preview, don't save to DB yet
    const posts: Array<{
      content: string;
      hashtags: string[];
      mediaUrl?: string | null;
      publicMediaUrl?: string | null;
      metadata: typeof metadata;
    }> = [];

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
        hashtags: generated.hashtags || [],
        mediaUrl,
        publicMediaUrl,
        metadata,
      });
    }

    if (posts.length === 0) {
      throw new Error("Failed to generate any content");
    }

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Generation error:", error);

    let message = "Failed to generate content";
    const err = error as { status?: number; message?: string };

    if (err.status === 429 || err.message?.includes("429") || err.message?.includes("quota")) {
      message = "AI provider rate limit or quota exceeded. Try switching text providers in product settings.";
    } else if (err.message) {
      message = err.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
