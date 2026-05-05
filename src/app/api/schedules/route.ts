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
      contentType: schema.generationSchedules.contentType,
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

  if (!body.productId || !body.platform || !body.contentType) {
    return NextResponse.json({ error: "productId, platform, contentType required" }, { status: 400 });
  }

  const result = await db
    .insert(schema.generationSchedules)
    .values({
      productId: body.productId,
      platform: body.platform,
      contentType: body.contentType,
      count: body.count || 1,
      frequencyHours: body.frequencyHours || 24,
      preferredTime: body.preferredTime || "09:00",
      enabled: body.enabled !== false,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}
