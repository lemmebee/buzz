import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET() {
  const schedules = await db
    .select({
      id: schema.generationSchedules.id,
      productId: schema.generationSchedules.productId,
      productName: schema.products.name,
      platform: schema.generationSchedules.platform,
      mediaType: schema.generationSchedules.mediaType,
      targetSurface: schema.generationSchedules.targetSurface,
      config: schema.generationSchedules.config,
      count: schema.generationSchedules.count,
      frequencyHours: schema.generationSchedules.frequencyHours,
      preferredTime: schema.generationSchedules.preferredTime,
      enabled: schema.generationSchedules.enabled,
      lastRunAt: schema.generationSchedules.lastRunAt,
      createdAt: schema.generationSchedules.createdAt,
    })
    .from(schema.generationSchedules)
    .leftJoin(schema.products, eq(schema.generationSchedules.productId, schema.products.id));

  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const targetSurface = body.targetSurface || body.contentType;
  const mediaType = body.mediaType || "image";

  if (!body.productId || !body.platform || !targetSurface) {
    return NextResponse.json(
      { error: "productId, platform, targetSurface required" },
      { status: 400 }
    );
  }
  if (targetSurface === "reel" && mediaType === "image") {
    return NextResponse.json(
      { error: "Reels require video. Pick mediaType=video or change surface." },
      { status: 400 }
    );
  }

  const result = await db
    .insert(schema.generationSchedules)
    .values({
      productId: body.productId,
      platform: body.platform,
      mediaType,
      targetSurface,
      config: body.config ? JSON.stringify(body.config) : null,
      count: body.count || 1,
      frequencyHours: body.frequencyHours || 24,
      preferredTime: body.preferredTime || "09:00",
      enabled: body.enabled !== false,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}
