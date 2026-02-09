import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { buildContentGenerationPrompt } from "../src/lib/brain/prompts";
import { createTextProvider } from "../src/lib/providers/factory";

async function main() {
  const productId = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

  const product = productId
    ? db.select().from(schema.products).where(eq(schema.products.id, productId)).get()
    : db.select().from(schema.products).get();

  if (!product) {
    console.error("No product found" + (productId ? ` with id ${productId}` : " in DB"));
    process.exit(1);
  }

  if (!product.profile || !product.marketingStrategy) {
    console.error("Product missing profile or marketingStrategy. Run extraction first.");
    process.exit(1);
  }

  const profile = JSON.parse(product.profile);
  const marketingStrategy = JSON.parse(product.marketingStrategy);
  const screenshotPaths: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  console.log("=== Buzz E2E: Profile + Strategy -> X Post Draft ===\n");
  console.log(`Product: ${product.name}`);
  console.log(`Linked X account: ${product.xAccountId ? `yes (${product.xAccountId})` : "no"}`);

  const images: string[] = [];
  for (const p of screenshotPaths) {
    try {
      const buffer = fs.readFileSync(path.join(process.cwd(), "public", p));
      images.push(buffer.toString("base64"));
    } catch {
      // skip
    }
  }

  const textProvider = createTextProvider();
  const { prompt: systemPrompt } = buildContentGenerationPrompt(
    profile,
    marketingStrategy,
    images.length,
    "twitter",
    "post"
  );

  const textResult = await textProvider.generate({
    systemPrompt,
    userPrompt: "Generate one X post. Keep total tweet text <= 260 characters before hashtags. Return valid JSON only.",
    images: images.length > 0 ? images : undefined,
    maxTokens: 2048,
    temperature: 0.8,
  });

  const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse provider JSON response");
  }

  const generated = JSON.parse(jsonMatch[0]) as {
    caption?: string;
    hashtags?: string[];
  };

  const caption = generated.caption || "";
  const hashtags = Array.isArray(generated.hashtags) ? generated.hashtags : [];
  const tweetText = hashtags.length > 0
    ? `${caption}\n\n${hashtags.map((t) => `#${String(t).replace(/^#/, "")}`).join(" ")}`
    : caption;

  console.log(`Tweet chars: ${tweetText.length}`);
  if (tweetText.length > 280) {
    console.warn("Warning: generated tweet exceeds 280 characters and will fail posting.");
  }

  const post = db.insert(schema.posts).values({
    productId: product.id,
    platform: "twitter",
    type: "post",
    content: caption,
    hashtags: hashtags.length > 0 ? JSON.stringify(hashtags.map((t) => String(t).replace(/^#/, ""))) : null,
    mediaUrl: null,
    status: "draft",
  }).returning().get();

  console.log(`Draft post saved: id=${post.id}`);
  console.log("=== Done ===");
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
