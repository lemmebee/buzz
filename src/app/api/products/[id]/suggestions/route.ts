import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUsageStats, suggestLeastUsed } from "@/lib/brain/rotation";
import { normalizeStrategy } from "@/lib/brain/types";

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

  const strategy = normalizeStrategy(JSON.parse(product.marketingStrategy));
  const usageStats = await getUsageStats(productId);

  // Extract hook texts for rotation compat
  const hookTexts = strategy.hooks.map(h => typeof h === "string" ? h : h.text);
  // Strip stage from objections for rotation compat
  const objectionTexts = strategy.objections.map(o => o.objection);

  const suggestions = {
    suggestedHook: suggestLeastUsed(hookTexts, usageStats.hooks),
    suggestedPillar: suggestLeastUsed(strategy.contentPillars || [], usageStats.pillars),
    suggestedPain: suggestLeastUsed(strategy.painPoints || [], usageStats.pains),
    suggestedDesire: suggestLeastUsed(strategy.desirePoints || [], usageStats.desires),
    suggestedObjection: objectionTexts.length
      ? suggestLeastUsed(objectionTexts, usageStats.objections)
      : null,
    usageStats,
    available: {
      hooks: hookTexts,
      pillars: strategy.contentPillars || [],
      pains: strategy.painPoints || [],
      desires: strategy.desirePoints || [],
      objections: strategy.objections.map(o => ({ objection: o.objection, counter: o.counter })),
    },
  };

  return NextResponse.json(suggestions);
}
