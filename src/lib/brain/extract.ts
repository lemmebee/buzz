import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildProfileAndStrategyPrompt } from "./prompts";
import { createTextProvider } from "@/lib/providers";
import { prepareImages } from "@/lib/images";

/**
 * Extract app profile + marketing strategy from brief + screenshots.
 * Runs async (fire-and-forget from API routes), stores results in DB.
 */
export async function extractProfileAndStrategy(
  productId: number,
  planFileContent: string,
  screenshotPaths: string[]
): Promise<void> {
  const provider = createTextProvider();
  const systemPrompt = buildProfileAndStrategyPrompt(planFileContent);

  // Load, resize, compress, and limit screenshots
  const prepared = await prepareImages(screenshotPaths);
  const images = prepared.map((p) => p.base64);

  const result = await provider.generate({
    systemPrompt,
    userPrompt: images.length > 0
      ? `I've attached ${images.length} app screenshots. Analyze the brief and screenshots together.`
      : "Analyze the marketing brief and extract the profile and strategy.",
    images: images.length > 0 ? images : undefined,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // Parse JSON from response
  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Failed to parse extraction response:", result.text);
    return;
  }

  const parsed = JSON.parse(jsonMatch[0]);

  await db.update(schema.products)
    .set({
      appProfile: JSON.stringify(parsed.appProfile),
      marketingStrategy: JSON.stringify(parsed.marketingStrategy),
    })
    .where(eq(schema.products.id, productId));

  console.log(`Extracted profile + strategy for product ${productId}`);
}
