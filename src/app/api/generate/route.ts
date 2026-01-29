import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import type { Platform, ContentPurpose, ContentTargeting } from "@/lib/brain/types";
import { createTextProvider, createPollinationsImageProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const body = await req.json();
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

  const profile = JSON.parse(product.profile);
  const marketingStrategy = JSON.parse(product.marketingStrategy);
  const screenshotPaths: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  // Load screenshot images as base64
  const images: string[] = [];
  for (const path of screenshotPaths) {
    try {
      const absPath = join(process.cwd(), "public", path);
      const buffer = await readFile(absPath);
      images.push(buffer.toString("base64"));
    } catch {
      // skip missing files
    }
  }

  try {
    const textProvider = createTextProvider();
    const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
      profile,
      marketingStrategy,
      images.length,
      platform,
      contentType,
      targeting
    );

    // Ask for multiple posts in one LLM call
    const userPrompt = generateCount > 1
      ? `Generate ${generateCount} unique variations. Return valid JSON array: [{"caption": "...", "hashtags": [...], "imagePrompt": {...}}, ...]`
      : "Generate the content now. Return valid JSON only.";

    const textResult = await textProvider.generate({
      systemPrompt,
      userPrompt,
      images: images.length > 0 ? images : undefined,
      maxTokens: 4096 * generateCount,
      temperature: 0.9,
    });

    // Parse response - could be array or single object
    let generatedItems: Array<{ caption: string; hashtags?: string[]; imagePrompt?: { scene?: string; aspectRatio?: string } }>;

    if (generateCount > 1) {
      const arrayMatch = textResult.text.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        throw new Error("Failed to parse array response");
      }
      generatedItems = JSON.parse(arrayMatch[0]);
    } else {
      const objMatch = textResult.text.match(/\{[\s\S]*\}/);
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
      metadata: typeof metadata;
    }> = [];

    // TODO: re-enable image generation when ready
    const ENABLE_IMAGE_GENERATION = false;

    for (const generated of generatedItems) {
      let mediaUrl: string | null = null;
      if (ENABLE_IMAGE_GENERATION && generated.imagePrompt?.scene) {
        const imageProvider = createPollinationsImageProvider();
        const aspectRatio = generated.imagePrompt.aspectRatio || "1:1 square";
        const isVertical = aspectRatio.includes("9:16");

        const imageResult = await imageProvider.generate({
          prompt: generated.imagePrompt.scene,
          width: isVertical ? 768 : 1024,
          height: isVertical ? 1365 : 1024,
        });
        mediaUrl = imageResult.localPath || imageResult.url;
      }

      posts.push({
        content: generated.caption,
        hashtags: generated.hashtags || [],
        mediaUrl,
        metadata,
      });
    }

    if (posts.length === 0) {
      throw new Error("Failed to generate any content");
    }

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
