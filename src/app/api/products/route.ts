import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// GET all products
export async function GET() {
  const products = await db.select().from(schema.products);
  return NextResponse.json(products);
}

// POST new product
export async function POST(req: NextRequest) {
  const body = await req.json();

  const result = await db.insert(schema.products).values({
    name: body.name,
    description: body.description,
    url: body.url || null,
    features: body.features ? JSON.stringify(body.features) : null,
    audience: body.audience || null,
    tone: body.tone || null,
    themes: body.themes ? JSON.stringify(body.themes) : null,
    planFile: body.planFile || null,
    planFileName: body.planFileName || null,
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
