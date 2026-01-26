import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET single post
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, parseInt(id)));

  if (post.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(post[0]);
}

// PUT update post
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.content !== undefined) updateData.content = body.content;
  if (body.hashtags !== undefined)
    updateData.hashtags = JSON.stringify(body.hashtags);
  if (body.status !== undefined) updateData.status = body.status;
  if (body.mediaUrl !== undefined) updateData.mediaUrl = body.mediaUrl;
  if (body.scheduledAt !== undefined)
    updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (body.postedAt !== undefined)
    updateData.postedAt = body.postedAt ? new Date(body.postedAt) : null;
  if (body.instagramId !== undefined) updateData.instagramId = body.instagramId;

  const result = await db
    .update(schema.posts)
    .set(updateData)
    .where(eq(schema.posts.id, parseInt(id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result[0]);
}

// DELETE post
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await db.delete(schema.posts).where(eq(schema.posts.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
