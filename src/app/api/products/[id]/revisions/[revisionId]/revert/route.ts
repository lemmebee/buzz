import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { snapshotChangedFields } from "@/lib/revisions";

type Params = { params: Promise<{ id: string; revisionId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, revisionId } = await params;
  const productId = parseInt(id);

  const revision = await db
    .select()
    .from(schema.productRevisions)
    .where(eq(schema.productRevisions.id, parseInt(revisionId)))
    .get();

  if (!revision || revision.productId !== productId) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  const existing = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Snapshot current value before reverting (so revert is reversible)
  const field = revision.field as "planFile" | "profile" | "marketingStrategy";
  await snapshotChangedFields(existing, { [field]: revision.content }, "manual");

  // Overwrite product field with revision content
  const updated = await db
    .update(schema.products)
    .set({ [field]: revision.content })
    .where(eq(schema.products.id, productId))
    .returning();

  return NextResponse.json(updated[0]);
}
