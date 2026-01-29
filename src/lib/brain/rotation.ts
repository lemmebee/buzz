import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface UsageStats {
  hooks: Record<string, number>;
  pillars: Record<string, number>;
  pains: Record<string, number>;
  desires: Record<string, number>;
  objections: Record<string, number>;
}

export async function getUsageStats(productId: number): Promise<UsageStats> {
  const posts = await db.query.posts.findMany({
    where: eq(schema.posts.productId, productId),
  });

  const stats: UsageStats = {
    hooks: {},
    pillars: {},
    pains: {},
    desires: {},
    objections: {},
  };

  for (const post of posts) {
    if (post.hookUsed) {
      stats.hooks[post.hookUsed] = (stats.hooks[post.hookUsed] || 0) + 1;
    }
    if (post.pillarUsed) {
      stats.pillars[post.pillarUsed] = (stats.pillars[post.pillarUsed] || 0) + 1;
    }
    if (post.targetType && post.targetValue) {
      if (post.targetType === "pain") {
        stats.pains[post.targetValue] = (stats.pains[post.targetValue] || 0) + 1;
      } else if (post.targetType === "desire") {
        stats.desires[post.targetValue] = (stats.desires[post.targetValue] || 0) + 1;
      } else if (post.targetType === "objection") {
        stats.objections[post.targetValue] = (stats.objections[post.targetValue] || 0) + 1;
      }
    }
  }

  return stats;
}

export function suggestLeastUsed<T extends string>(items: T[], usage: Record<string, number>): T | null {
  if (items.length === 0) return null;

  let minCount = Infinity;
  let suggested: T = items[0];

  for (const item of items) {
    const count = usage[item] || 0;
    if (count < minCount) {
      minCount = count;
      suggested = item;
    }
  }

  return suggested;
}
