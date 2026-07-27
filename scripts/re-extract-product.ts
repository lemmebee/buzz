import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { extractProfileAndStrategy } from "../src/lib/brain/extract";

async function main() {
  const productId = parseInt(process.argv[2] || "1");
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });

  if (!product) {
    console.error(`Product ${productId} not found`);
    return;
  }

  if (!product.planFile) {
    console.error(`Product ${productId} has no planFile`);
    return;
  }

  // Get screenshots from the product
  const screenshotPaths: string[] = product.screenshots 
    ? JSON.parse(product.screenshots) 
    : [];

  console.log(`Re-extracting for: ${product.name} (id: ${product.id})`);
  console.log(`Screenshots: ${screenshotPaths.length}`);
  console.log(`Logo: ${product.logo || "none"}`);
  console.log("Running extraction...\n");

  await extractProfileAndStrategy({
    productId: product.id,
    name: product.name,
    description: product.description,
    planFileContent: product.planFile,
    screenshotPaths,
    logoPath: product.logo || undefined,
    textProvider: product.textProvider || undefined,
    llmInstructions: product.llmInstructions || undefined,
  });

  // Read back from DB
  const updated = await db.query.products.findFirst({
    where: eq(schema.products.id, product.id),
  });

  if (updated?.profile) {
    const profile = JSON.parse(updated.profile);
    console.log("\n--- Product Profile ---");
    console.log("Visual Identity Style:", profile.visualIdentity?.style?.slice(0, 200));
    console.log("Visual Identity Colors:", profile.visualIdentity?.colors?.slice(0, 200));
    console.log("Visual Identity Mood:", profile.visualIdentity?.mood?.slice(0, 200));
  }

  console.log("\nExtraction complete.");
}

main().catch(console.error);
