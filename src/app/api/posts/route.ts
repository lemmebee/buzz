import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

// GET all posts (optionally filter by status)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  if (status) {
    const posts = await db
      .select()
      .from(schema.content)
      .where(eq(schema.content.status, status))
      .orderBy(desc(schema.content.id));
    return NextResponse.json(posts);
  }

  const posts = await db.select().from(schema.content).orderBy(desc(schema.content.id));
  return NextResponse.json(posts);
}

// POST new post
export async function POST(req: NextRequest) {
  const body = await req.json();

  const result = await db
    .insert(schema.content)
    .values({
      productId: body.productId,
      mediaType: body.mediaType || "image",
      targetSurface: body.targetSurface || body.type,
      content: body.content,
      hashtags: body.hashtags ? JSON.stringify(body.hashtags) : null,
      mediaUrl: body.mediaUrl || null,
      publicMediaUrl: body.publicMediaUrl || null,
      script: body.script || null,
      duration: body.duration ?? null,
      audioUrl: body.audioUrl || null,
      captionsUrl: body.captionsUrl || null,
      config: body.config ? JSON.stringify(body.config) : null,
      status: body.status || "draft",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      hookUsed: body.hookUsed || null,
      pillarUsed: body.pillarUsed || null,
      targetType: body.targetType || null,
      targetValue: body.targetValue || null,
      toneConstraints: body.toneConstraints ? JSON.stringify(body.toneConstraints) : null,
      visualDirection: body.visualDirection || null,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}
