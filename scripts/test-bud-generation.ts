import "dotenv/config";
import { parseProductPlan } from "../src/lib/brain/parser";
import { buildCaptionPrompt } from "../src/lib/brain/prompts";
import { createHuggingFaceTextProvider } from "../src/lib/providers";

// Bud product plan markdown
const BUD_PLAN = `
# Name
Bud

# Description
Cannabis relationship companion app. Helps users understand their cannabis habits
without judgment. Not about quitting - about awareness and intentional use.

# Features
- Daily check-ins tracking mood, consumption, and context
- Pattern insights showing correlations over time
- Gentle nudges, never shame
- Private and secure - data stays on device

# Audience
Cannabis users aged 18-35 who want to be more mindful about their consumption.
Not trying to quit, just understand their relationship with weed better.

# Tone
Warm, non-judgmental, curious, supportive. Like a chill friend who asks good questions.

# Themes
- "Curious about your cannabis habits?"
- "Not trying to quit, just understand"
- "Your relationship with weed, on your terms"
- "Mindful consumption without the guilt"

# Visual Style
Calm, earthy tones. Soft gradients. Friendly illustrations. No stoner clichés.
`;

async function main() {
  console.log("=== Bud Content Generation Test ===\n");

  // 1. Parse product plan
  console.log("1. Parsing product plan...");
  const result = parseProductPlan(BUD_PLAN);
  if (!result.success) {
    console.error("Parse failed:", result.error);
    return;
  }
  console.log(`   Product: ${result.plan.name}`);
  console.log(`   Audience: ${result.plan.audience}`);
  console.log(`   Tone: ${result.plan.tone}\n`);

  // 2. Build caption prompt for Instagram reel
  console.log("2. Building Instagram reel caption prompt...");
  const captionPrompt = buildCaptionPrompt(result.plan, "instagram", "reel");
  console.log(`   Prompt length: ${captionPrompt.length} chars\n`);

  // 3. Generate with HuggingFace
  console.log("3. Generating caption with GLM-4.7-Flash...\n");
  const provider = createHuggingFaceTextProvider();

  const response = await provider.generate({
    systemPrompt: captionPrompt,
    userPrompt: "Generate the reel caption now. Return valid JSON only.",
    temperature: 0.8,
  });

  console.log("--- Generated Response ---");
  console.log(response.text);
  console.log("\n--- Token Usage ---");
  if (response.usage) {
    console.log(`Prompt: ${response.usage.promptTokens}`);
    console.log(`Completion: ${response.usage.completionTokens}`);
    console.log(`Total: ${response.usage.totalTokens}`);
  }

  // 4. Try to parse the JSON response
  console.log("\n--- Parsed Result ---");
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("Caption:", parsed.caption);
      console.log("Hashtags:", parsed.hashtags?.join(" "));
    }
  } catch {
    console.log("(Could not parse JSON from response)");
  }
}

main().catch(console.error);
