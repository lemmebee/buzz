import "dotenv/config";
import { readdirSync } from "fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { extractProfileAndStrategy } from "../src/lib/brain/extract";

async function main() {
  const product = db.select().from(schema.products).where(eq(schema.products.name, "Bud")).get();
  if (!product?.planFile) {
    console.error("No Bud product with planFile found");
    return;
  }

  // Use screenshots from public/screenshots if available
  let screenshotPaths: string[] = [];
  try {
    const files = readdirSync("public/screenshots").filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    screenshotPaths = files.map((f) => `/screenshots/${f}`);
  } catch { /* no screenshots dir */ }

  console.log(`Extracting for: ${product.name}`);
  console.log(`Screenshots: ${screenshotPaths.length}`);
  console.log("Running extraction...\n");

  await extractProfileAndStrategy(product.id, product.planFile, screenshotPaths);

  // Read back from DB
  const updated = db.select().from(schema.products).where(eq(schema.products.id, product.id)).get();
  console.log("\n--- App Profile ---");
  console.log(JSON.stringify(JSON.parse(updated!.appProfile!), null, 2));
  console.log("\n--- Marketing Strategy ---");
  console.log(JSON.stringify(JSON.parse(updated!.marketingStrategy!), null, 2));
}

main().catch(console.error);
