import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateContent } from "@/lib/claude";
import { buildGeneratePrompt, parseGeneratedContent, type ContentType } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, contentType, count = 5 } = body as {
    productId: number;
    contentType: ContentType;
    count?: number;
  };

  if (!productId || !contentType) {
    return NextResponse.json({ error: "productId and contentType required" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const prompt = buildGeneratePrompt({ product, contentType, count });

  try {
    const response = await generateContent(prompt);
    const posts = parseGeneratedContent(response);

    return NextResponse.json({
      productId,
      contentType,
      posts,
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
