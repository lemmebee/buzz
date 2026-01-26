import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// GET single product
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const product = await db.select().from(schema.products).where(eq(schema.products.id, parseInt(id))).get();

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

// PUT update product
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const result = await db.update(schema.products)
    .set({
      name: body.name,
      description: body.description,
      url: body.url || null,
      features: body.features ? JSON.stringify(body.features) : null,
      audience: body.audience || null,
      tone: body.tone || null,
      themes: body.themes ? JSON.stringify(body.themes) : null,
      planFile: body.planFile || null,
      planFileName: body.planFileName || null,
    })
    .where(eq(schema.products.id, parseInt(id)))
    .returning();

  if (!result.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result[0]);
}

// DELETE product
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  await db.delete(schema.products).where(eq(schema.products.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
