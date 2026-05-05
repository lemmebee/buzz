import { NextRequest, NextResponse } from "next/server";
import type { Platform, ContentPurpose, ContentTargeting } from "@/lib/brain/types";
import { generateContent } from "@/lib/generate";

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

  if (!productId || !platform || !contentType) {
    return NextResponse.json({ error: "productId, platform, and contentType required" }, { status: 400 });
  }

  // Load uploaded screenshots as base64
  const images: string[] = [];
  const uploadedFiles = formData.getAll("screenshots") as File[];
  for (const file of uploadedFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push(buffer.toString("base64"));
  }

  try {
    const posts = await generateContent({ productId, platform, contentType, targeting, count, images });
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
