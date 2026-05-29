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

  const screenshotPaths: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  // Need SOME source of truth: a plan file, screenshots, or a landing URL.
  if (!product.planFile && screenshotPaths.length === 0 && !product.landingUrl) {
    return NextResponse.json(
      { error: "Nothing to extract from — add a plan file, screenshots, or a landing URL first" },
      { status: 400 }
    );
  }

  // Set pending status
  await db.update(schema.products)
    .set({ extractionStatus: "pending" })
    .where(eq(schema.products.id, productId));

  // Fire and forget
  extractProfileAndStrategy({
    productId,
    name: product.name,
    description: product.description,
    planFileContent: product.planFile || product.description,
    screenshotPaths,
    textProvider: product.textProvider || undefined,
    landingUrl: product.landingUrl,
  }).catch(console.error);

  return NextResponse.json({ status: "extracting" });
}
