import { NextRequest, NextResponse } from "next/server";
import type { Platform, ContentPurpose, ContentTargeting, MediaType } from "@/lib/brain/types";
import { createJob } from "@/lib/jobQueue";
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
    contentType,
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
    const jobId = await createJob({
      productId,
      platform,
      mediaType: media,
      targetSurface: surface,
      config: config as ContentConfig,
      targeting,
      count,
      images,
    });

    // Fire-and-forget: trigger processing via a separate request
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3004";
    fetch(`${baseUrl}/api/jobs/process?jobId=${jobId}`).catch(err =>
      console.error("Failed to trigger job processing:", err)
    );

    return NextResponse.json({ jobId, status: "pending" });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: classifyProviderError(error) }, { status: 500 });
  }
}
