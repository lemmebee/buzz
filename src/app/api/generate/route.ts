import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildContentGenerationPrompt } from "@/lib/brain/prompts";
import type { Platform, ContentPurpose } from "@/lib/brain/types";
import { createTextProvider, createPollinationsImageProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, platform, contentType } = body as {
    productId: number;
    platform: Platform;
    contentType: ContentPurpose;
  };

  if (!productId || !platform || !contentType) {
    return NextResponse.json({ error: "productId, platform, and contentType required" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.appProfile || !product.marketingStrategy) {
    return NextResponse.json({ error: "Product missing appProfile or marketingStrategy. Upload a brief first." }, { status: 400 });
  }

  const appProfile = JSON.parse(product.appProfile);
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
    // 1. Text provider: caption + image instructions
    const textProvider = createTextProvider();
    const systemPrompt = buildContentGenerationPrompt(
      appProfile,
      marketingStrategy,
      images.length,
      platform,
      contentType
    );

    const textResult = await textProvider.generate({
      systemPrompt,
      userPrompt: "Generate the content now. Return valid JSON only.",
      images: images.length > 0 ? images : undefined,
      maxTokens: 4096,
      temperature: 0.8,
    });

    const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse content generation response");
    }

    const generated = JSON.parse(jsonMatch[0]);

    // 2. Image provider: generate image from instructions
    let mediaUrl: string | null = null;
    if (generated.imagePrompt?.scene) {
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

    // 3. Store post in DB
    const post = await db.insert(schema.posts).values({
      productId,
      type: contentType,
      content: generated.caption,
      hashtags: generated.hashtags ? JSON.stringify(generated.hashtags) : null,
      mediaUrl,
      status: "draft",
    }).returning();

    return NextResponse.json({
      post: post[0],
      imagePrompt: generated.imagePrompt,
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
