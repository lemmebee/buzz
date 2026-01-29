import "dotenv/config";
import fs from "fs";
import path from "path";
import { db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";
import { buildContentGenerationPrompt } from "../src/lib/brain/prompts";
import { createTextProvider } from "../src/lib/providers/factory";
import { createPollinationsImageProvider } from "../src/lib/providers/image";

async function main() {
  const productId = process.argv[2] ? parseInt(process.argv[2]) : undefined;

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

  console.log("=== Buzz E2E: Profile + Strategy → Insta Post ===\n");
  console.log(`Product: ${product.name}`);
  console.log(`Screenshots: ${screenshotPaths.length}\n`);

  // Load screenshots as base64
  const images: string[] = [];
  for (const p of screenshotPaths) {
    try {
      const buffer = fs.readFileSync(path.join(process.cwd(), "public", p));
      images.push(buffer.toString("base64"));
    } catch { /* skip */ }
  }

  const textProvider = createTextProvider();
  const imageProvider = createPollinationsImageProvider();

  // 1. Single call: caption + image instructions
  console.log("1. Generating caption + image instructions...");
  const { prompt: systemPrompt } = buildContentGenerationPrompt(profile, marketingStrategy, images.length, "instagram", "post");
  const textResult = await textProvider.generate({
    systemPrompt,
    userPrompt: "Generate the content now. Return valid JSON only.",
    images: images.length > 0 ? images : undefined,
    maxTokens: 4096,
    temperature: 0.8,
  });

  const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response");
  const generated = JSON.parse(jsonMatch[0]);

  console.log(`   Caption:\n${generated.caption.split("\n").map((l: string) => "     " + l).join("\n")}`);
  console.log(`   Hashtags: ${generated.hashtags?.map((t: string) => "#" + t).join(" ")}`);
  console.log(`   Image scene: ${generated.imagePrompt?.scene?.slice(0, 120)}...\n`);

  // 2. Generate image
  if (generated.imagePrompt?.scene) {
    console.log("2. Generating image via Pollinations...");
    const imageResult = await imageProvider.generate({
      prompt: generated.imagePrompt.scene,
      width: 1080,
      height: 1080,
    });

    console.log(`   Saved: ${imageResult.localPath}\n`);
  }

  // 3. Store in DB
  const post = db.insert(schema.posts).values({
    productId: product.id,
    type: "post",
    content: generated.caption,
    hashtags: generated.hashtags ? JSON.stringify(generated.hashtags) : null,
    mediaUrl: null,
    status: "draft",
  }).returning().get();

  console.log(`Post saved: id=${post.id}\n`);
  console.log("=== Done! ===");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
