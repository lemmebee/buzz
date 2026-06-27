import "dotenv/config";
import { createAntigravityTextProvider, listAntigravityModels } from "../src/lib/providers";

async function main() {
  console.log("--- Listing available models ---");
  try {
    const models = await listAntigravityModels();
    console.log("Available models:", models);
  } catch (error) {
    console.error("Failed to list models:", error);
    return;
  }

  console.log("\n--- Testing default model ---");
  const provider = createAntigravityTextProvider();
  console.log(`Provider: ${provider.name}\n`);

  const result = await provider.generate({
    systemPrompt: "You are a marketing expert. Be concise.",
    userPrompt: "Write a one-sentence marketing hook for a smart water bottle.",
  });

  console.log("Response:", result.text);
}

main().catch(console.error);
