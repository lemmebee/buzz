import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, and } from "drizzle-orm";

// GET all posts (optionally filter by status and/or productId)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const productId = req.nextUrl.searchParams.get("productId");

  const query = db.select().from(schema.content);

  if (status && productId) {
    const posts = await query
      .where(and(eq(schema.content.status, status), eq(schema.content.productId, parseInt(productId))))
      .orderBy(desc(schema.content.id));
    return NextResponse.json(posts);
  }

  if (status) {
    const posts = await query
      .where(eq(schema.content.status, status))
      .orderBy(desc(schema.content.id));
    return NextResponse.json(posts);
  }

  if (productId) {
    const posts = await query
      .where(eq(schema.content.productId, parseInt(productId)))
      .orderBy(desc(schema.content.id));
    return NextResponse.json(posts);
  }

  const posts = await query.orderBy(desc(schema.content.id));
  return NextResponse.json(posts);
}

// POST new post
/** Infer media kind from the stored file, for callers that omit it. */
function mediaTypeFromUrl(url?: string | null): "video" | "image" | null {
  if (!url) return null;
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? "video" : "image";
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const result = await db
    .insert(schema.content)
    .values({
      productId: body.productId,
      // Trust the file over the caller. Save payloads have omitted mediaType
      // before now, which silently filed every video as an image and left the
      // grid trying to render an .mp4 inside an <img>.
      mediaType: body.mediaType || mediaTypeFromUrl(body.mediaUrl) || "image",
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
