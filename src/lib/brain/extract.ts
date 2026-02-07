import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildProfileAndStrategyPrompt } from "./prompts";
import { createTextProvider } from "@/lib/providers";
import { prepareImages } from "@/lib/images";
import { snapshotChangedFields } from "@/lib/revisions";

interface ExtractionParams {
  productId: number;
  name: string;
  description: string;
  planFileContent: string;
  screenshotPaths: string[];
  textProvider?: string;
}

/**
 * Extract product profile + marketing strategy from brief + screenshots.
 * Runs async (fire-and-forget from API routes), stores results in DB.
 */
export async function extractProfileAndStrategy({
  productId,
  name,
  description,
  planFileContent,
  screenshotPaths,
  textProvider,
}: ExtractionParams): Promise<void> {
  // Set status to extracting
  await db.update(schema.products)
    .set({ extractionStatus: "extracting" })
    .where(eq(schema.products.id, productId));

  try {
    const provider = createTextProvider(textProvider);
    const systemPrompt = buildProfileAndStrategyPrompt({ name, description, planFileContent });

    // Load, resize, compress, and limit screenshots
    const prepared = await prepareImages(screenshotPaths);
    const images = prepared.map((p) => p.base64);

    const result = await provider.generate({
      systemPrompt,
      userPrompt: images.length > 0
        ? `I've attached ${images.length} product screenshot${images.length > 1 ? "s" : ""}. Screenshots are your PRIMARY source of truth — the brief fills gaps. Study every pixel: colors, typography, spacing, UI elements, microcopy, navigation, feature screens. Extract exact hex colors, real feature names from labels, and actual brand voice from button text and copy. If the brief and screenshots contradict, trust the screenshots.`
        : "Analyze the marketing brief and extract the profile and strategy. Since no screenshots are provided, make explicit assumptions about visual identity based on the product category and tone.",
      images: images.length > 0 ? images : undefined,
      maxTokens: 8192,
      temperature: 0.4,
    });

    // Parse JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse extraction response:", result.text);
      await db.update(schema.products)
        .set({ extractionStatus: "failed" })
        .where(eq(schema.products.id, productId));
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Snapshot existing values before overwriting
    const existing = await db.select().from(schema.products).where(eq(schema.products.id, productId)).get();
    if (existing) {
      await snapshotChangedFields(existing, {
        profile: JSON.stringify(parsed.profile),
        marketingStrategy: JSON.stringify(parsed.marketingStrategy),
      }, "extraction");
    }

    await db.update(schema.products)
      .set({
        profile: JSON.stringify(parsed.profile),
        marketingStrategy: JSON.stringify(parsed.marketingStrategy),
        extractionStatus: "done",
      })
      .where(eq(schema.products.id, productId));

    console.log(`Extracted profile + strategy for product ${productId}`);
  } catch (error) {
    console.error(`Extraction failed for product ${productId}:`, error);
    await db.update(schema.products)
      .set({ extractionStatus: "failed" })
      .where(eq(schema.products.id, productId));
  }
}
