import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.platform !== undefined) updates.platform = body.platform;
  if (body.contentType !== undefined) updates.contentType = body.contentType;
  if (body.count !== undefined) updates.count = body.count;
  if (body.frequencyHours !== undefined) updates.frequencyHours = body.frequencyHours;
  if (body.preferredTime !== undefined) updates.preferredTime = body.preferredTime;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const result = await db
    .update(schema.generationSchedules)
    .set(updates)
    .where(eq(schema.generationSchedules.id, parseInt(id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json(result[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await db
    .delete(schema.generationSchedules)
    .where(eq(schema.generationSchedules.id, parseInt(id)));

  return NextResponse.json({ ok: true });
}
