import "dotenv/config";
import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { createHuggingFaceTextProvider } from "../src/lib/providers";

async function main() {
  const provider = createHuggingFaceTextProvider();
  console.log(`Testing provider: ${provider.name}\n`);

  // Load bud product plan from DB
  const product = db.select().from(schema.products).where(eq(schema.products.name, "Bud")).get();
  if (!product?.planFile) {
    console.error("No Bud product with planFile found in DB");
    return;
  }
  console.log(`Loaded plan: ${product.planFileName}\n`);

  // Test 1: text-only using plan from DB
  console.log("--- Test 1: Text-only ---");
  const result1 = await provider.generate({
    systemPrompt: "You are a marketing expert. Be concise.",
    userPrompt: `Based on this marketing brief, write a one-sentence marketing hook:\n\n${product.planFile}`,
  });
  console.log("Response:", result1.text);
  if (result1.usage) console.log("Usage:", result1.usage);

  // Test 2: with image
  const imagePath = process.argv[2];
  if (imagePath) {
    console.log("\n--- Test 2: With image ---");
    const imageBase64 = readFileSync(imagePath).toString("base64");
    const result2 = await provider.generate({
      systemPrompt: "You are a marketing expert. Describe what you see and suggest a caption.",
      userPrompt: `Based on this marketing brief and the screenshot, write a short marketing caption:\n\n${product.planFile}`,
      images: [imageBase64],
    });
    console.log("Response:", result2.text);
    if (result2.usage) console.log("Usage:", result2.usage);
  } else {
    console.log("\n--- Test 2: Skipped (no image path arg) ---");
  }
}

main().catch(console.error);
