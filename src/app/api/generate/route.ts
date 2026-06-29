import { NextRequest, NextResponse } from "next/server";
import type { Platform, ContentPurpose, ContentTargeting, MediaType } from "@/lib/brain/types";
import { generateContent } from "@/lib/generate";
import { classifyProviderError } from "@/lib/providers/errors";
import type { ContentConfig } from "@/lib/content/defaults";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const body = JSON.parse(formData.get("data") as string);
  const {
    productId,
    platform,
    mediaType,
    targetSurface,
    contentType, // legacy alias for targetSurface
    config,
    targeting,
    count = 1,
  } = body as {
    productId: number;
    platform: Platform;
    mediaType?: MediaType;
    targetSurface?: ContentPurpose;
    contentType?: ContentPurpose;
    config?: Partial<ContentConfig>;
    targeting?: ContentTargeting;
    count?: number;
  };

  const surface = targetSurface || contentType;
  const media: MediaType = mediaType || "image";

  if (!productId || !platform || !surface) {
    return NextResponse.json(
      { error: "productId, platform, and targetSurface required" },
      { status: 400 }
    );
  }
  if (surface === "reel" && media === "image") {
    return NextResponse.json(
      { error: "Reels require video. Pick mediaType=video or change surface." },
      { status: 400 }
    );
  }

  const images: string[] = [];
  const uploadedFiles = formData.getAll("screenshots") as File[];
  for (const file of uploadedFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push(buffer.toString("base64"));
  }

  try {
    const { posts, errors } = await generateContent({
      productId,
      platform,
      mediaType: media,
      targetSurface: surface,
      config,
      targeting,
      count,
      images,
    });
    // Nothing salvageable -> surface the failure. Otherwise return what succeeded
    // alongside any per-variation errors so the UI can show both.
    if (posts.length === 0) {
      return NextResponse.json(
        { error: errors[0]?.message ?? "Failed to generate content", errors },
        { status: 500 }
      );
    }
    return NextResponse.json({ posts, errors });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: classifyProviderError(error) }, { status: 500 });
  }
}
