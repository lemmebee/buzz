import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const field = req.nextUrl.searchParams.get("field");

  const conditions = [eq(schema.productRevisions.productId, parseInt(id))];
  if (field) {
    conditions.push(eq(schema.productRevisions.field, field));
  }

  const revisions = await db
    .select()
    .from(schema.productRevisions)
    .where(and(...conditions))
    .orderBy(desc(schema.productRevisions.createdAt));

  return NextResponse.json(revisions);
}
