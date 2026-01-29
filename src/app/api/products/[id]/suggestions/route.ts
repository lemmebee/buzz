import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUsageStats, suggestLeastUsed } from "@/lib/brain/rotation";
import type { MarketingStrategy } from "@/lib/brain/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (!product.marketingStrategy) {
    return NextResponse.json({ error: "Product has no marketing strategy" }, { status: 400 });
  }

  const strategy: MarketingStrategy = JSON.parse(product.marketingStrategy);
  const usageStats = await getUsageStats(productId);

  const suggestions = {
    suggestedHook: suggestLeastUsed(strategy.hooks || [], usageStats.hooks),
    suggestedPillar: suggestLeastUsed(strategy.contentPillars || [], usageStats.pillars),
    suggestedPain: suggestLeastUsed(strategy.painPoints || [], usageStats.pains),
    suggestedDesire: suggestLeastUsed(strategy.desirePoints || [], usageStats.desires),
    suggestedObjection: strategy.objections?.length
      ? suggestLeastUsed(
          strategy.objections.map(o => o.objection),
          usageStats.objections
        )
      : null,
    usageStats,
    available: {
      hooks: strategy.hooks || [],
      pillars: strategy.contentPillars || [],
      pains: strategy.painPoints || [],
      desires: strategy.desirePoints || [],
      objections: strategy.objections || [],
    },
  };

  return NextResponse.json(suggestions);
}
