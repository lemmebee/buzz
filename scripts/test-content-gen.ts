import "dotenv/config";
import { readdirSync } from "fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { buildContentGenerationPrompt } from "../src/lib/brain/prompts";
import { createHuggingFaceTextProvider } from "../src/lib/providers";
import { prepareImages } from "../src/lib/images";

async function main() {
  const product = db.select().from(schema.products).where(eq(schema.products.name, "Bud")).get();
  if (!product?.profile || !product?.marketingStrategy) {
    console.error("No Bud product with extracted profile/strategy found");
    return;
  }

  const profile = JSON.parse(product.profile);
  const marketingStrategy = JSON.parse(product.marketingStrategy);

  // Load screenshots (resized + compressed)
  let images: string[] = [];
  try {
    const files = readdirSync("public/screenshots").filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    const paths = files.map((f) => `/screenshots/${f}`);
    const prepared = await prepareImages(paths);
    images = prepared.map((p) => p.base64);
  } catch { /* no screenshots */ }

  const { prompt: systemPrompt, metadata } = buildContentGenerationPrompt(
    profile,
    marketingStrategy,
    images.length,
    "instagram",
    "post"
  );

  console.log(`Generating content for: ${product.name}`);
  console.log(`Screenshots: ${images.length}`);
  console.log("Platform: instagram, Type: post");
  console.log("Targeting metadata:", metadata, "\n");

  const provider = createHuggingFaceTextProvider();
  const result = await provider.generate({
    systemPrompt,
    userPrompt: "Generate a post now. Return valid JSON only.",
    images: images.length > 0 ? images : undefined,
    maxTokens: 4096,
    temperature: 0.8,
  });

  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("--- Caption ---");
    console.log(parsed.caption);
    console.log("\n--- Hashtags ---");
    console.log(parsed.hashtags?.join(" "));
    console.log("\n--- Image Prompt ---");
    console.log(JSON.stringify(parsed.imagePrompt, null, 2));
  } else {
    console.log("Raw response:", result.text);
  }

  if (result.usage) console.log("\nUsage:", result.usage);
}

main().catch(console.error);
