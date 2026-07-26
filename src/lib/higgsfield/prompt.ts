import { jsonrepair } from "jsonrepair";
import { resolveTextProvider } from "@/lib/providers/factory";
import { sanitizeCaption } from "@/lib/generate";
import { composeSkillSection, skillsEnabled } from "@/lib/skills";
import type { HiggsfieldContext } from "./context";

// Cap planFile to ~4000 chars to avoid blowing the context window.
// A typical marketing brief is 2-8k chars; we take the first portion
// which contains the executive summary, positioning, and key messages.
const PLAN_FILE_CHAR_CAP = 4000;

export function getCreativeAngleLabel(variationIndex: number): string {
  return CREATIVE_ANGLES[variationIndex % CREATIVE_ANGLES.length].label;
}

const CREATIVE_ANGLES = [
  {
    label: "Product Hero",
    direction:
      "Place the product front-and-center as the hero subject. Clean composition, strong negative space, studio-quality lighting. The product IS the story.",
    motionHint: "Slow dolly-in toward the product, subtle light shift from cool to warm.",
  },
  {
    label: "Lifestyle Context",
    direction:
      "Show the product in its natural habitat — the real environment where the target user would encounter it. Contextual, aspirational, lived-in feel.",
    motionHint: "Gentle handheld-style drift, as if someone is walking past and noticing the product.",
  },
  {
    label: "Bold Abstract",
    direction:
      "Distill the brand's essence into a striking abstract composition. Graphic, high-contrast, mood-driven. Think brand identity as art piece.",
    motionHint: "Static frame with a slow color shift or gradient animation across the background.",
  },
  {
    label: "Problem-Solution",
    direction:
      "Visualise the pain point or desire the product addresses. Create tension between 'before' (chaos/lack) and 'after' (resolution), with the product as the bridge.",
    motionHint: "Quick snap-zoom from a cluttered/dim scene to a clean/bright one.",
  },
  {
    label: "Minimal Statement",
    direction:
      "Extreme restraint. One object, one color accent, vast whitespace. The product speaks through absence and precision.",
    motionHint: "No camera motion. A single element enters frame slowly from off-screen.",
  },
];

function truncatePlanFile(planFile: string | null | undefined): string {
  if (!planFile) return "";
  if (planFile.length <= PLAN_FILE_CHAR_CAP) return planFile;
  return planFile.slice(0, PLAN_FILE_CHAR_CAP) + "\n[...truncated]";
}

function buildSystemPrompt(ctx: HiggsfieldContext, angleIdx: number, variationIndex: number, usedAngles?: string[]): string {
  const angle = CREATIVE_ANGLES[angleIdx];
  const sections: string[] = [];
  const hasReferenceImage = ctx.logoMediaId || ctx.screenshotMediaIds.length > 0;

  sections.push(
    `You are a world-class creative director producing a single ${ctx.mediaType} ${ctx.targetSurface} for "${ctx.name}".`
  );
  sections.push(
    `You write prompts for a generative AI media tool (Higgsfield). Your output is NOT the final content — it is the instruction that produces the content.`
  );

  sections.push(`## WRITING STYLE
- Write like a real human, not a marketing bot
- NEVER use em dashes (—) anywhere in your output
- NEVER use AI cliché words: elevate, unlock, dive into, unleash, game-changer, seamlessly, revolutionize, empower, leverage, cutting-edge, next-level
- Be specific and concrete, never vague or aspirational
- Captions should sound like a real person posting, not a press release`);

  if (ctx.llmInstructions?.trim()) {
    sections.push(`## USER INSTRUCTIONS (follow these in addition to default rules)\n${ctx.llmInstructions.trim()}`);
  }

  if (skillsEnabled()) {
    const skillSection = composeSkillSection("content");
    if (skillSection) sections.push(skillSection);
  }

  sections.push(`## PRODUCT CONTEXT
Name: ${ctx.name}
Description: ${ctx.description}`);

  if (ctx.profile) {
    const p = ctx.profile;
    if (p.tagline) sections.push(`Tagline: ${p.tagline}`);
    if (p.coreValue) sections.push(`Core Value: ${p.coreValue}`);
    if (p.audience?.primary) sections.push(`Audience: ${p.audience.primary}`);
    if (p.visualIdentity) {
      const v = p.visualIdentity;
      if (v.style || v.colors || v.mood) {
        sections.push(`Visual Identity — style: "${v.style}", colors: "${v.colors}", mood: "${v.mood}"`);
      }
    }
    if (p.brandStory) sections.push(`Brand Story: ${p.brandStory}`);
    if (p.differentiators?.length) sections.push(`Differentiators: ${p.differentiators.join("; ")}`);
  }

  if (ctx.marketingStrategy) {
    const s = ctx.marketingStrategy;
    if (s.visualDirection) sections.push(`Visual Direction: ${s.visualDirection}`);
    if (s.contentPillars?.length) sections.push(`Content Pillars: ${s.contentPillars.join("; ")}`);
    if (s.brandVoice?.samplePhrases?.length) {
      sections.push(`Brand Voice Samples: ${s.brandVoice.samplePhrases.map((p) => `"${p}"`).join(", ")}`);
    }
  }

  if (ctx.icp) {
    try {
      const icpStr = typeof ctx.icp === "string" ? ctx.icp : JSON.stringify(ctx.icp);
      sections.push(`Target Persona (ICP): ${icpStr.slice(0, 500)}`);
    } catch {
      // ignore parse errors
    }
  }

  if (ctx.jtbd) {
    try {
      const jtbdStr = typeof ctx.jtbd === "string" ? ctx.jtbd : JSON.stringify(ctx.jtbd);
      sections.push(`Jobs-to-be-Done: ${jtbdStr.slice(0, 500)}`);
    } catch {
      // ignore parse errors
    }
  }

  if (ctx.targeting) {
    sections.push(`Targeting: ${JSON.stringify(ctx.targeting).slice(0, 300)}`);
  }

  if (ctx.config) {
    const configKeys = ["purpose", "tone", "style"];
    const configParts = configKeys
      .filter(k => ctx.config[k as keyof typeof ctx.config])
      .map(k => `${k}: ${ctx.config[k as keyof typeof ctx.config]}`);
    if (configParts.length) {
      sections.push(`Content Config: ${configParts.join(", ")}`);
    }
  }

  const planContent = truncatePlanFile(ctx.planFile);
  if (planContent) {
    sections.push(`## MARKETING BRIEF (excerpt)\n${planContent}`);
  }

  if (ctx.brainstormIdeas.length > 0) {
    const ideas = ctx.brainstormIdeas.slice(0, 5);
    sections.push(`## BRAINSTORM IDEAS (draw inspiration from these, do not copy verbatim)`);
    for (const idea of ideas) {
      sections.push(`- [${idea.kind}] ${idea.title}: ${idea.hook}`);
    }
  }

  if (ctx.instagramHandle) {
    sections.push(`Instagram Handle: ${ctx.instagramHandle} — mention naturally in caption if appropriate.`);
  }

  if (ctx.channelHints?.length) {
    sections.push(`Channel Hints: ${ctx.channelHints.join(", ")}`);
  }

  sections.push(`## CREATIVE ANGLE FOR THIS VARIATION
**${angle.label}**
${angle.direction}`);

  if (usedAngles && usedAngles.length > 0) {
    sections.push(`IMPORTANT: This is variation ${variationIndex + 1}. Previous variations used these angles: ${usedAngles.join(", ")}. Your creative direction MUST be visibly distinct from those. Do not repeat their composition, mood, or visual approach.`);
  } else {
    sections.push(`This angle MUST be visibly distinct from other variations. Lean into it fully.`);
  }

  if (hasReferenceImage) {
    sections.push(`## REFERENCE IMAGE FIDELITY (CRITICAL)
A reference image (logo or app screenshot) is attached. The image model will use it directly.

Your imagePrompt must describe ONLY the scene AROUND the device:
- Surface, lighting, background, camera angle, mood, environment
- Do NOT describe the app screen, its colours, its layout, or any on-screen text
- Do NOT instruct the model to restyle or recolour the reference image

Include this exact phrase in your imagePrompt: "Reproduce the provided reference image exactly as supplied; do not restyle, recolour, or alter any content within it."

Brand palette guidance applies to the ENVIRONMENT, not the screen.`);
  }

  sections.push(`## OUTPUT FORMAT
Return ONLY valid JSON with this exact structure:
{
  "imagePrompt": "A detailed natural-language paragraph describing the scene around the reference image. Include setting, lighting, camera angle, mood. ${hasReferenceImage ? "End with: 'Reproduce the provided reference image exactly as supplied; do not restyle, recolour, or alter any content within it.'" : "No people, no readable text."} 30-80 words.",
  "motionPrompt": "A short concrete description of camera/subject motion for an image-to-video step. 10-25 words.",
  "caption": "The full caption text without hashtags. Sound human, not AI.",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`);

  return sections.join("\n\n");
}

export async function buildHiggsfieldPrompt(
  ctx: HiggsfieldContext,
  variationIndex: number,
  usedAngles?: string[]
): Promise<{ imagePrompt: string; motionPrompt: string; caption: string; hashtags: string[] }> {
  const angleIdx = variationIndex % CREATIVE_ANGLES.length;
  const systemPrompt = buildSystemPrompt(ctx, angleIdx, variationIndex, usedAngles);
  const userPrompt = `Generate the ${ctx.mediaType} ${ctx.targetSurface} content now. Return ONLY valid JSON.`;

  const textProvider = await resolveTextProvider(ctx.textProvider);
  const result = await textProvider.generate({
    systemPrompt,
    userPrompt,
    maxTokens: 2048,
    temperature: 0.95,
  });

  const cleaned = result.text.replace(/```(?:json)?\s*/gi, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from text provider response");
  }

  let parsed: { imagePrompt?: string; motionPrompt?: string; caption?: string; hashtags?: string[] };
  try {
    parsed = JSON.parse(jsonrepair(jsonMatch[0]));
  } catch (err) {
    throw new Error(`Failed to parse JSON even after repair: ${err}`);
  }

  const imagePrompt = parsed.imagePrompt?.trim() || "";
  const motionPrompt = parsed.motionPrompt?.trim() || CREATIVE_ANGLES[angleIdx].motionHint;
  const rawCaption = parsed.caption?.trim() || "";
  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).filter(Boolean) : [];

  if (!imagePrompt) {
    throw new Error("Text provider returned empty imagePrompt");
  }

  const caption = sanitizeCaption(rawCaption);

  return { imagePrompt, motionPrompt, caption, hashtags };
}
