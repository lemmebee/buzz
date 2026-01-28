import "dotenv/config";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { products } from "../drizzle/schema";
import { buildGenerationPrompts } from "../src/lib/brain/prompts";
import { createHuggingFaceTextProvider } from "../src/lib/providers";
import type { ProductPlan, Platform, ContentPurpose, MediaType } from "../src/lib/brain/types";

// Connect to Buzz DB
const sqlite = new Database("./data/buzz.db");
const db = drizzle(sqlite);

interface GeneratedContent {
  caption: string;
  hashtags: string[];
  mediaPrompt: string;
  script?: string;
}

function productToProductPlan(product: typeof products.$inferSelect): ProductPlan {
  return {
    name: product.name,
    description: product.description,
    audience: product.audience || "",
    tone: product.tone || "casual",
  };
}

async function generateContent(
  productPlan: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose,
  mediaType: MediaType
): Promise<GeneratedContent> {
  // Build all prompts using Buzz's marketing mind
  const prompts = buildGenerationPrompts(productPlan, platform, purpose, mediaType);

  // Initialize provider
  const provider = createHuggingFaceTextProvider();

  // Generate caption + hashtags
  const captionResponse = await provider.generate({
    systemPrompt: prompts.captionPrompt,
    userPrompt: "Generate the caption now. Return valid JSON only, no markdown.",
    temperature: 0.8,
  });

  let caption = "";
  let hashtags: string[] = [];
  try {
    const match = captionResponse.text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      caption = parsed.caption || "";
      hashtags = parsed.hashtags || [];
    }
  } catch {
    caption = captionResponse.text;
  }

  // Generate media prompt (for image/video AI)
  const mediaResponse = await provider.generate({
    systemPrompt: prompts.mediaPrompt,
    userPrompt: "Generate the media prompt now. Return only the prompt text.",
    temperature: 0.7,
  });
  const mediaPrompt = mediaResponse.text.trim();

  // Generate script if video/audio
  let script: string | undefined;
  if (prompts.scriptPrompt) {
    const scriptResponse = await provider.generate({
      systemPrompt: prompts.scriptPrompt,
      userPrompt: "Write the script now. Return valid JSON only, no markdown.",
      temperature: 0.8,
    });
    try {
      const match = scriptResponse.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        script = parsed.script || scriptResponse.text;
      }
    } catch {
      script = scriptResponse.text;
    }
  }

  return { caption, hashtags, mediaPrompt, script };
}

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     BUZZ - Content Generation Test     ║");
  console.log("╚════════════════════════════════════════╝\n");

  // Fetch Bud from database
  const [budProduct] = db.select().from(products).where(eq(products.name, "Bud")).all();

  if (!budProduct) {
    console.error("Bud product not found. Run: npm run db:seed");
    process.exit(1);
  }

  const productPlan = productToProductPlan(budProduct);

  console.log(`Product: ${productPlan.name}`);
  console.log(`Audience: ${productPlan.audience}`);
  console.log(`Tone: ${productPlan.tone}\n`);

  const platform: Platform = "instagram";
  const purpose: ContentPurpose = "reel";
  const mediaType: MediaType = "video";

  console.log(`Platform: ${platform}`);
  console.log(`Purpose: ${purpose}`);
  console.log(`Media: ${mediaType}\n`);
  console.log("Generating content...\n");

  const content = await generateContent(productPlan, platform, purpose, mediaType);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("CAPTION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(content.caption);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("HASHTAGS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("VIDEO PROMPT (for AI generation)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(content.mediaPrompt);

  if (content.script) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SCRIPT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(content.script);
  }

  console.log("\n✓ Content generation complete");
}

main().catch(console.error);
