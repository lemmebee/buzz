import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { extractProfileAndStrategy } from "@/lib/brain/extract";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const productId = parseInt(id);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.planFile) {
    return NextResponse.json({ error: "No plan file stored — upload one first" }, { status: 400 });
  }

  // Set pending status
  await db.update(schema.products)
    .set({ extractionStatus: "pending" })
    .where(eq(schema.products.id, productId));

  const screenshotPaths: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  // Fire and forget
  extractProfileAndStrategy({
    productId,
    name: product.name,
    description: product.description,
    planFileContent: product.planFile,
    screenshotPaths,
    textProvider: product.textProvider || undefined,
  }).catch(console.error);

  return NextResponse.json({ status: "extracting" });
}
