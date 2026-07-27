import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildProfileAndStrategyPrompt } from "./prompts";
import { resolveTextProvider } from "@/lib/providers";
import { prepareImages } from "@/lib/images";
import { snapshotChangedFields } from "@/lib/revisions";
import { classifyProviderError } from "@/lib/providers/errors";
import { timed } from "@/lib/traces";

interface ExtractionParams {
  productId: number;
  name: string;
  description: string;
  planFileContent: string;
  screenshotPaths: string[];
  logoPath?: string | null;
  textProvider?: string;
  llmInstructions?: string;
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
  logoPath,
  textProvider,
  llmInstructions,
}: ExtractionParams): Promise<void> {
  // Set status to extracting
  await db.update(schema.products)
    .set({ extractionStatus: "extracting", extractionError: null })
    .where(eq(schema.products.id, productId));

  try {
    const provider = await resolveTextProvider(textProvider);
    const systemPrompt = buildProfileAndStrategyPrompt({ name, description, planFileContent, llmInstructions });

    // prepareImages returns bare base64; providers expect a data: URI, a served
    // URL, or a filesystem path. Passing bare base64 makes every image resolve
    // to null and the model silently receives none — which is how the profile
    // ended up inventing a visual identity it had never seen.
    const toDataUri = (b64: string) => `data:image/jpeg;base64,${b64}`;

    const prepared = await prepareImages(screenshotPaths);
    const images = prepared.map((p) => toDataUri(p.base64));

    let hasLogo = false;
    if (logoPath) {
      const logoPrepared = await prepareImages([logoPath], { maxImages: 1, maxWidth: 512, maxHeight: 512, quality: 80 });
      if (logoPrepared.length > 0) {
        images.unshift(toDataUri(logoPrepared[0].base64));
        hasLogo = true;
      }
    }

    console.log(`[extract] product ${productId}: ${prepared.length}/${screenshotPaths.length} screenshots prepared, logo=${hasLogo}`);

    const totalImages = images.length;
    const userPrompt = hasLogo
      ? `The first image is the product logo. Study it for brand colors, mark style, and visual identity. The remaining ${totalImages - 1} image(s) are product screenshots. Screenshots are your PRIMARY source of truth — the brief fills gaps. Study every pixel: colors, typography, spacing, UI elements, microcopy, navigation, feature screens. Extract exact hex colors, real feature names from labels, and actual brand voice from button text and copy. If the brief and screenshots contradict, trust the screenshots.`
      : totalImages > 0
        ? `I've attached ${totalImages} product screenshot${totalImages > 1 ? "s" : ""}. Screenshots are your PRIMARY source of truth — the brief fills gaps. Study every pixel: colors, typography, spacing, UI elements, microcopy, navigation, feature screens. Extract exact hex colors, real feature names from labels, and actual brand voice from button text and copy. If the brief and screenshots contradict, trust the screenshots.`
        : "Analyze the marketing brief and extract the profile and strategy. Since no screenshots are provided, make explicit assumptions about visual identity based on the product category and tone.";

    const result = await timed(
      {
        productId,
        phase: "extraction",
        step: "profile-and-strategy",
        provider: provider.name,
        model: provider.name,
        input: JSON.stringify({
          systemPrompt,
          userPrompt,
          // Counts, not bytes — the images themselves would swamp the trace.
          screenshotsRequested: screenshotPaths.length,
          screenshotsAttached: prepared.length,
          logoAttached: hasLogo,
          imagesSentToModel: images.length,
        }),
      },
      () =>
        provider.generate({
          systemPrompt,
          userPrompt,
          images: images.length > 0 ? images : undefined,
          maxTokens: 8192,
          temperature: 0.4,
        }),
      (r) => ({ text: r.text })
    );

    // Parse JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse extraction response:", result.text);
      await db.update(schema.products)
        .set({ extractionStatus: "failed", extractionError: "Model returned invalid JSON." })
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
        extractionError: null,
      })
      .where(eq(schema.products.id, productId));

    console.log(`Extracted profile + strategy for product ${productId}`);
  } catch (error) {
    console.error(`Extraction failed for product ${productId}:`, error);
    await db.update(schema.products)
      .set({ extractionStatus: "failed", extractionError: classifyProviderError(error) })
      .where(eq(schema.products.id, productId));
  }
}
