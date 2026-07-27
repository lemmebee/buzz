import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Full, untruncated trace — the list endpoint only returns previews. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid trace id" }, { status: 400 });
  }

  try {
    const trace = await db.query.generationTraces.findFirst({
      where: eq(schema.generationTraces.id, id),
    });

    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    // Product name saves the UI a second request just to render a heading.
    let productName: string | null = null;
    if (trace.productId) {
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, trace.productId),
      });
      productName = product?.name ?? null;
    }

    return NextResponse.json({ ...trace, productName });
  } catch (err) {
    console.error("[traces] detail API error:", err);
    return NextResponse.json({ error: "Failed to fetch trace" }, { status: 500 });
  }
}
