import type { Platform, ContentPurpose, ContentTargeting, GenerationMetadata, CategorizedHook, HookType, BrandVoice, BrainstormIdea, BrainstormKind } from "./types";
import { normalizeProfile, normalizeStrategy } from "./types";
import { composeSkillSection } from "@/lib/skills";

// Platform-specific rules and best practices
const PLATFORM_RULES: Record<Platform, string> = {
  instagram: `Instagram Rules:
- Reels: Hook in first 3 seconds, 15-90 seconds optimal, vertical 9:16
- Posts: Square or vertical, 2200 char caption limit
- Stories: 15-second segments, interactive stickers boost engagement
- Hashtags: 3-5 highly relevant > 30 generic, mix popular + niche
- Peak times: 11am-1pm, 7pm-9pm local time
- Tone: Authentic, visually polished, aspirational but relatable`,

  twitter: `Twitter/X Rules:
- Tweets: 280 char limit, threads for longer content
- Hook in first line - it shows in timeline preview
- Images boost engagement 2-3x, videos 6x
- Optimal posting: 2-5 tweets/day, spaced out
- Hashtags: 1-2 max, more looks spammy
- Quote tweets and replies drive organic reach
- Threads: First tweet is the hook, value in middle, CTA at end
- Tone: Conversational, punchy, personality-forward`,
};

// Content formulas by purpose
const CONTENT_FORMULAS: Record<ContentPurpose, string> = {
  reel: `Reel Formula:
1. HOOK (0-3s): Pattern interrupt, bold claim, or curiosity gap
2. CONTEXT (3-7s): Quick setup of the problem/situation
3. VALUE (7-25s): Deliver the meat - tips, transformation, story
4. CTA (last 3s): Clear action - follow, save, comment, link in bio`,

  post: `Post Formula:
1. OPENING: Story hook or bold statement (stop the scroll)
2. BODY: Value, insight, or narrative (keep them reading)
3. ENGAGEMENT: Question or CTA (drive comments)
4. HASHTAGS: Strategic placement at end`,

  story: `Story Formula:
1. Attention grab - poll, question, or bold text
2. Build context with 2-3 frames
3. Payoff or CTA in final frame
4. Use interactive elements (polls, sliders, quizzes)`,

  ad: `Ad Formula:
1. HOOK: Problem or desire in first 3 seconds
2. AGITATE: Make the pain/desire tangible
3. SOLUTION: Introduce product as the answer
4. PROOF: Testimonial, results, credibility
5. CTA: Clear, urgent, specific action`,
};

// System prompt for extracting product profile + marketing strategy from brief + screenshots
interface ExtractionInput {
  name: string;
  description: string;
  planFileContent: string;
  llmInstructions?: string;
}

/**
 * Canonical "USER INSTRUCTIONS" block shared by every prompt builder, so a product's
 * custom instructions reach the model framed identically across extraction, content
 * generation, and brainstorming. Returns null when there are no instructions to inject.
 */
function composeUserInstructions(llmInstructions?: string): string | null {
  const trimmed = llmInstructions?.trim();
  if (!trimmed) return null;
  return `## USER INSTRUCTIONS (follow these in addition to the default rules)\n${trimmed}`;
}

export function buildProfileAndStrategyPrompt({ name, description, planFileContent, llmInstructions }: ExtractionInput): string {
  const sections: string[] = [];
  sections.push(`You are an expert marketing strategist extracting a deep product profile and content strategy from a marketing brief.`);
  sections.push(composeSkillSection("profile-strategy"));
  const userInstructions = composeUserInstructions(llmInstructions);
  if (userInstructions) sections.push(userInstructions);
  sections.push(`## PHASE 1 — THINK (internal analysis, do NOT output this)

Before writing any JSON, answer these questions internally:
- What is the REAL problem this product solves? Not the feature description — the felt pain.
- Who is the real buyer? What do they do at 2am when they can't sleep? What makes them feel behind?
- What alternatives exist? Why would someone choose THIS over the obvious competitor?
- What's the emotional journey from "never heard of it" → "just bought it"?
- What objections come up at awareness vs consideration vs decision stage?
- What would a customer say recommending this to a friend? (That's the real voice.)

## PHASE 2 — QUALITY CRITERIA

Every field you produce must be:
- SPECIFIC — mentions the actual product, actual audience, actual use case. "Busy professionals" = bad. "Solo founders juggling dev + marketing at 11pm" = good.
- ACTIONABLE — a content creator can use it directly in a post without rewording.
- DISTINCT — each item in a list covers a different angle. No overlapping entries.
- VOICE-AUTHENTIC — sounds like the brand would actually say it, not a marketing textbook.

## PHASE 3 — EXAMPLES (good vs generic)

Hooks:
- GENERIC: "Tired of struggling with marketing?" ← could be any product
- GOOD: "You spent 4 hours on a reel that got 12 likes. Here's why." ← specific, stings, curious

Pain points:
- GENERIC: "Difficulty creating content" ← obvious, vague
- GOOD: "Staring at a blank Canva screen for 45 minutes then posting nothing" ← visceral, relatable

Voice rules:
- GENERIC: "Be friendly and professional" ← meaningless
- GOOD: "Write like a smart friend texting — lowercase ok, dashes over commas, never say 'utilize'" ← actionable

## PHASE 4 — OUTPUT

Product: ${name}
Description: ${description}

Marketing Brief:
${planFileContent}

## SCREENSHOT ANALYSIS (if screenshots are provided)

Screenshots are PRIMARY evidence — they reveal what the brief can't say. Analyze every screenshot carefully and extract:

**Visual Identity (→ profile.visualIdentity)**
- Exact dominant colors: name + approximate hex (e.g. "deep navy #1a2744, warm amber #e8a54b")
- Secondary/accent colors used for CTAs, highlights, links
- Typography: serif vs sans-serif, weight, rounded vs geometric, monospaced elements
- Shape language: rounded corners vs sharp, card-based vs flat, border styles
- Spacing: airy/minimal vs dense/data-rich, whitespace usage
- Overall aesthetic: minimal, playful, corporate, premium, brutalist, technical, etc.

**Features & Core Value (→ profile.features, profile.coreValue)**
- Every visible UI element, screen, dashboard, or feature shown
- What the product ACTUALLY DOES based on what you can see — not just what the brief claims
- Navigation items, menu labels, section headers = feature map
- Empty states, onboarding flows = intended user journey

**Brand Personality (→ profile.brandPersonality)**
- Microcopy tone: are buttons formal ("Submit") or casual ("Let's go")?
- Error messages, tooltips, labels — these reveal true brand voice
- Illustration style if present: hand-drawn, geometric, 3D, none
- Does it feel startup-y, enterprise, indie, playful?

**Price Positioning (→ profile.pricePositioning)**
- Pricing page if visible: tiers, amounts, free trial presence
- UI polish level: highly polished = premium, functional/sparse = budget/developer tool
- Feature density: more features visible = mid-market/enterprise

**Audience Signals (→ profile.audience, profile.customerSegments)**
- Who would USE this interface? What skill level does the UI assume?
- Dashboard complexity → technical vs non-technical user
- Jargon in labels → industry-specific audience
- Mobile vs desktop layout → usage context

**Competitive Clues (→ profile.competitorContext)**
- Does the UI resemble known products? Note which ones and how it differs
- Unique UI patterns that competitors don't have

**Content Hooks (→ marketingStrategy.hooks)**
- Impressive UI moments that would make good "look at this" content
- Before/after states visible in the UI
- Data visualizations or results screens = social proof material

If NO screenshots are provided, derive visual identity from the brief's tone and category. State assumptions.

## LOGO ANALYSIS (if the first image is a logo)

The first attached image is the product's logo/mark. Study it carefully and extract:

**Brand Colors (→ profile.visualIdentity.colors)**
- Exact hex values of ALL colors in the logo (background, foreground, accent colors)
- Primary brand color (the most dominant/prominent)
- Secondary colors used sparingly

**Mark Style (→ profile.visualIdentity.style)**
- Type: icon/symbol, wordmark (text only), lettermark (initials), emblem (badge/seal), combination mark
- If icon: what does it represent? Abstract shape, object, animal, person, etc.
- Complexity: minimal/simple, moderate detail, intricate/ornate

**Typography (if text present)**
- Font style: serif, sans-serif, script/handwritten, display/decorative, monospace
- Weight: light, regular, medium, bold, black
- Character: geometric, humanist, rounded, angular, condensed, extended
- Custom lettering or unique modifications

**Shape Language**
- Geometric: circles, squares, triangles, clean lines
- Organic: curves, flowing lines, natural forms
- Angular: sharp corners, dynamic angles
- Rounded: soft corners, friendly feel

**Brand Personality (→ profile.brandPersonality)**
- What does the logo communicate? Premium/luxury, playful/fun, technical/professional, organic/natural, bold/aggressive, elegant/sophisticated
- Target audience implied by the logo style
- Industry/category signals

Use the logo as PRIMARY evidence for visualIdentity and brandPersonality. The logo is the brand's visual anchor — extract every detail.

Return ONLY valid JSON with this exact structure:
{
  "profile": {
    "name": "string",
    "tagline": "string — one-liner value prop that could be a tweet",
    "category": "string — product category",
    "coreValue": "string — the #1 benefit in one sentence",
    "features": ["string — 4-6 key features"],
    "audience": {
      "primary": "string — specific main target",
      "demographics": "string — age, role, context",
      "psychographics": "string — mindset, values, frustrations"
    },
    "tone": "string — brand voice in a phrase",
    "visualIdentity": {
      "style": "string — design language",
      "colors": "string — palette description",
      "mood": "string — emotional feel"
    },
    "differentiators": ["string — 3-5 things that make it genuinely unique"],
    "pricePositioning": "premium|mid-market|budget|freemium",
    "brandPersonality": {
      "archetypes": ["string — 1-2 brand archetypes e.g. 'rebel', 'sage', 'creator'"],
      "traits": ["string — 3-5 personality adjectives"],
      "voiceDos": ["string — 4-6 specific writing rules TO follow"],
      "voiceDonts": ["string — 4-6 specific things to NEVER say or do"]
    },
    "competitorContext": "string — 1-2 sentences positioning vs alternatives",
    "customerSegments": [
      {
        "label": "string — segment name",
        "painPoints": ["string — 2-3 pains specific to this segment"],
        "desires": ["string — 2-3 desires specific to this segment"],
        "messagingAngle": "string — how to talk to this segment"
      }
    ],
    "brandStory": "string — 2-3 sentence origin/mission story"
  },
  "marketingStrategy": {
    "hooks": [
      {"text": "string — scroll-stopping hook", "type": "curiosity|pain|desire|social-proof|contrarian"}
    ],
    "themes": ["string — recurring content themes"],
    "contentPillars": ["string — 3-4 content categories"],
    "painPoints": ["string — 5-7 audience problems this solves"],
    "desirePoints": ["string — 5-7 aspirations this fulfills"],
    "objections": [
      {"objection": "string", "counter": "string", "stage": "awareness|consideration|decision"}
    ],
    "brandVoice": {
      "dos": ["string — 5-7 voice rules to follow"],
      "donts": ["string — 5-7 voice rules to avoid"],
      "samplePhrases": ["string — 5-8 phrases that sound like this brand"]
    },
    "ctaStrategies": [
      {"goal": "follow|save|comment|click|share|buy", "cta": "string — the actual CTA text", "context": "string — when to use this CTA"}
    ],
    "visualDirection": "string — how images should feel"
  }
}

COUNT REQUIREMENTS:
- hooks: 10-12 (mix all 5 types: curiosity, pain, desire, social-proof, contrarian)
- customerSegments: 2-3
- objections: 5-7 (spread across awareness, consideration, decision)
- ctaStrategies: 4-6 (cover different goals)
- painPoints: 5-7
- desirePoints: 5-7
- brandVoice.samplePhrases: 5-8`);
  return sections.join("\n");
}

// Parse tone guidelines into constraint list
function parseToneGuidelines(toneGuidelines: string): string[] {
  if (!toneGuidelines) return [];
  // Split by common delimiters and clean up
  return toneGuidelines
    .split(/[,;.\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100);
}

// Hook type preferences by content type for smart selection
const HOOK_TYPE_PREFERENCES: Record<ContentPurpose, HookType[]> = {
  ad: ["pain", "social-proof", "desire"],
  reel: ["curiosity", "contrarian", "desire"],
  post: ["curiosity", "pain", "social-proof"],
  story: ["curiosity", "desire", "contrarian"],
};

/** Pick a hook, preferring types that match content type */
function selectHook(hooks: CategorizedHook[], contentType: ContentPurpose, manualHook?: string): string | null {
  if (manualHook) return manualHook;
  if (hooks.length === 0) return null;

  const preferred = HOOK_TYPE_PREFERENCES[contentType] || [];
  // Try preferred types first
  const preferredHooks = hooks.filter(h => preferred.includes(h.type));
  const pool = preferredHooks.length > 0 ? preferredHooks : hooks;
  return pool[Math.floor(Math.random() * pool.length)].text;
}

// Unified content generation prompt — produces caption + image instructions in one call
export function buildContentGenerationPrompt(
  rawProfile: Record<string, unknown>,
  rawStrategy: Record<string, unknown>,
  screenshotCount: number,
  platform: Platform,
  contentType: ContentPurpose,
  targeting?: ContentTargeting,
  accountHandle?: string,
  productName?: string,
  llmInstructions?: string,
  imageStyle?: string,
  hasLogo?: boolean
): { prompt: string; metadata: GenerationMetadata } {
  const profile = normalizeProfile(rawProfile);
  const strategy = normalizeStrategy(rawStrategy);
  const aspectRatio =
    contentType === "post" && platform === "instagram" ? "1:1 square" : "9:16 vertical";

  // Determine hook to use (smart selection by content type)
  const hooks = strategy.hooks as CategorizedHook[];
  const hookUsed = selectHook(hooks, contentType, targeting?.hook);

  // Pillar
  const pillarUsed = targeting?.pillar || null;

  // Target type/value
  const targetType = targeting?.targetType || null;
  const targetValue = targeting?.targetValue || null;

  // Brand voice (new) with fallback to parsed toneGuidelines
  const brandVoice: BrandVoice | undefined = strategy.brandVoice;
  const toneConstraints = brandVoice?.dos || parseToneGuidelines(strategy.toneGuidelines || "");
  const visualDirection = strategy.visualDirection || "";

  // Extract visual identity from profile
  const brandStyle = profile.visualIdentity?.style || "";
  const brandColors = profile.visualIdentity?.colors || "";
  const brandMood = profile.visualIdentity?.mood || "";

  // Image scene style: "product" (depict the product in context) | "abstract" (brand-mood still-life, original pipeline)
  const productScene = imageStyle !== "abstract";

  // Build targeted sections
  const sections: string[] = [];

  const name = productName || profile.name;
  sections.push(`You are a creative director producing a single ${platform} ${contentType} for "${name}".`);
  sections.push(`CRITICAL: You are writing ONLY about "${name}". Never mention, reference, or generate content about any other product or brand. Every caption must be specifically about "${name}" and its features/values described below.`);
  sections.push("");

  sections.push(`WRITING STYLE (sound human, not AI-generated):
- Write like a real person posting, not a marketing bot
- Use casual, imperfect language: contractions, sentence fragments, dashes, lowercase starts are fine
- NEVER use these AI cliché words/phrases: "elevate", "unlock", "dive into", "unleash", "game-changer", "seamlessly", "revolutionize", "empower", "leverage", "cutting-edge", "next-level", "Introducing..."
- ABSOLUTELY NEVER use the em dash character (—) anywhere in your output. Not in captions, not in hashtags, nowhere. Use commas, periods, hyphens, or line breaks instead. This is a hard rule with zero exceptions.
- No excessive exclamation marks or emoji spam
- Vary sentence length. Mix short punchy lines with longer ones
- Be specific and concrete, not vague and aspirational
- Sound like someone who actually uses the product, not someone selling it
- Match how real ${platform} creators write. Study the platform's native voice`);
  sections.push("");

  const userInstructions = composeUserInstructions(llmInstructions);
  if (userInstructions) {
    sections.push(userInstructions);
    sections.push("");
  }

  const skillSection = composeSkillSection("content");
  if (skillSection) sections.push(skillSection);

  // Product context (expanded)
  sections.push("PRODUCT CONTEXT:");
  sections.push(`Name: ${name}`);
  if (accountHandle) {
    sections.push(`Social Media Account: ${accountHandle}. Mention this handle naturally in the caption (e.g. "follow ${accountHandle}", "link in ${accountHandle} bio")`);
  }
  sections.push(`Tagline: ${profile.tagline || ""}`);
  sections.push(`Core Value: ${profile.coreValue || ""}`);
  sections.push(`Audience: ${JSON.stringify(profile.audience || {})}`);
  if (profile.pricePositioning) {
    sections.push(`Price Positioning: ${profile.pricePositioning}`);
  }
  if (profile.competitorContext) {
    sections.push(`Competitive Edge: ${profile.competitorContext}`);
  }
  if (profile.brandStory) {
    sections.push(`Brand Story: ${profile.brandStory}`);
  }
  if (brandStyle || brandColors || brandMood) {
    sections.push(`Visual Identity — style: "${brandStyle}", colors: "${brandColors}", mood: "${brandMood}"`);
  }
  sections.push("");

  // Customer segment context
  if (profile.customerSegments && profile.customerSegments.length > 0) {
    sections.push("CUSTOMER SEGMENTS (pick the most relevant for this content):");
    for (const seg of profile.customerSegments) {
      sections.push(`- ${seg.label}: pains=[${seg.painPoints.join(", ")}], desires=[${seg.desires.join(", ")}], angle="${seg.messagingAngle}"`);
    }
    sections.push("");
  }

  // Targeting directives
  if (hookUsed) {
    sections.push(`HOOK TO USE: "${hookUsed}"`);
  }

  if (pillarUsed) {
    sections.push(`CONTENT PILLAR: "${pillarUsed}"`);
  }

  if (targetType && targetValue) {
    if (targetType === "pain") {
      sections.push(`FOCUS: Address this pain point - "${targetValue}"`);
    } else if (targetType === "desire") {
      sections.push(`FOCUS: Tap into this desire - "${targetValue}"`);
    } else if (targetType === "objection") {
      const objMatch = (strategy.objections || []).find(o => o.objection === targetValue);
      if (objMatch) {
        sections.push(`FOCUS: Address objection "${objMatch.objection}" with counter "${objMatch.counter}"`);
      } else {
        sections.push(`FOCUS: Address objection - "${targetValue}"`);
      }
    }
  }

  sections.push("");

  // Brand voice rules (new format) or fallback tone rules
  if (brandVoice) {
    sections.push("BRAND VOICE:");
    if (brandVoice.dos.length > 0) {
      sections.push("DO:");
      brandVoice.dos.forEach(d => sections.push(`- ${d}`));
    }
    if (brandVoice.donts.length > 0) {
      sections.push("DON'T:");
      brandVoice.donts.forEach(d => sections.push(`- ${d}`));
    }
    if (brandVoice.samplePhrases.length > 0) {
      sections.push(`Sample phrases that sound like this brand: ${brandVoice.samplePhrases.map(p => `"${p}"`).join(", ")}`);
    }
    sections.push("");
  } else if (toneConstraints.length > 0) {
    sections.push("TONE RULES:");
    toneConstraints.forEach(t => sections.push(`- ${t}`));
    sections.push("");
  }

  // CTA strategy injection
  if (strategy.ctaStrategies && strategy.ctaStrategies.length > 0) {
    // Map content types to likely CTA goals
    const ctaGoalMap: Record<ContentPurpose, string[]> = {
      reel: ["follow", "save", "comment"],
      post: ["save", "comment", "share"],
      story: ["click", "comment", "follow"],
      ad: ["click", "buy", "follow"],
    };
    const preferredGoals = ctaGoalMap[contentType] || [];
    const matchedCtas = strategy.ctaStrategies.filter(c => preferredGoals.includes(c.goal));
    const ctasToShow = matchedCtas.length > 0 ? matchedCtas : strategy.ctaStrategies.slice(0, 2);

    sections.push("CTA OPTIONS (pick the best fit):");
    for (const cta of ctasToShow) {
      sections.push(`- [${cta.goal}] "${cta.cta}" — ${cta.context}`);
    }
    sections.push("");
  }

  sections.push(PLATFORM_RULES[platform]);
  sections.push("");
  sections.push(CONTENT_FORMULAS[contentType]);
  sections.push("");

  if (hasLogo) {
    sections.push(`The FIRST attached image is the product's logo. Study it for exact brand colors, mark style, and visual personality. Use these insights when crafting the image prompt — weave logo colors into "brandColorUsage" and align the mood with the logo's feel. The remaining ${screenshotCount} image(s) are product screenshots to classify as described below.`);
    sections.push("");
  }

  if (screenshotCount > 0) {
    sections.push(`You have ${screenshotCount} uploaded image(s) attached.

IMAGE CLASSIFICATION — for EACH image, determine its type:

A) FEATURE SPOTLIGHT (app screen, UI screenshot, product feature, dashboard, product photo)
   → CAPTION: reference specific UI elements, features, or experiences visible. Be concrete.
   → IMAGE PROMPT: ${productScene
    ? `convey what ${name} does and how it FEELS for THIS post's topic with a FRESH concept — draw on the Brand Story metaphor and Core Value, not a stock phone-on-a-desk shot. The device is optional; if shown, keep its screen textless abstract color blocks. Vary subject, composition and lighting from other posts.`
    : `create a scene rooted in the feature's real-world subject matter - what the user DOES or FEELS when using it. Don't recreate the UI - depict the real-world context the feature lives in, styled using the product's visual identity. Example: a mood tracking screen → a warm evening scene with a journal and candlelight in the brand's color palette. A budget dashboard → a serene workspace with neatly sorted objects in brand colors.`}

B) STYLE REFERENCE (moodboard, aesthetic inspo, design reference, color palette, lifestyle photo)
   → CAPTION: do NOT mention or describe this image. It's for visual direction only.
   → IMAGE PROMPT: extract mood, palette, lighting, composition, and texture from this image. Apply these qualities to the scene you create.

If you receive a mix, handle each image according to its type. Combine feature content in the caption and style cues in the image prompt.

The image model cannot see these images - your description is the only bridge. Weave extracted colors into "brandColorUsage".`);
  } else {
    sections.push("No images provided. Use the Visual Identity from PRODUCT CONTEXT for color and style cues.");
  }

  // IMAGE GENERATION RULES for Flux-optimized prompts
  sections.push("");
  sections.push(`IMAGE GENERATION RULES (the image model is Flux — follow these strictly):
- Write the scene as a natural language paragraph, NOT comma-separated tags
- Lead with the main visual element in the first sentence
- Weave brand colors (${brandColors || "infer from product"}) and mood (${brandMood || "infer from product"}) into the scene naturally
- Include camera lens/aperture for photo-realistic scenes (e.g. "shot on 50mm f/2.0")
- Do NOT add quality tags like "8k", "uhd", "highly detailed" — Flux ignores them
- Target 20-60 words for the scene field
- NEVER include people, human figures, faces, hands, or body parts — Flux renders them poorly
- NEVER include readable text, lettering, words, logos, or typography — Flux cannot render text correctly
${productScene
  ? `- Capture what ${name} IS and how it FEELS for THIS post's specific hook — lean on the Brand Story metaphor and Core Value above, not generic decor\n- VARY every image: rotate the concept, composition, angle and lighting between posts. Do NOT default to a phone lying on a desk next to a coffee cup — that repeated flatlay is banned\n- Each post, pick ONE concept from a DIFFERENT family: (a) the brand's core metaphor made visual, (b) the real moment of use, (c) the emotional outcome/feeling, (d) a bold abstract brand-motif with strong negative space and a soft primary-tinted glow, (e) the product's domain objects. The device is OPTIONAL — include it only if it serves the concept; any screen stays textless-abstract\n- Range the lighting and mood (calm warm light AND bold or moody/dark are both on-brand when the palette supports them) so images don't all look like the same warm beige scene`
  : `- Focus on products, objects, environments, abstract compositions, and still-life setups that evoke the product's essence — no devices, no UI`}`);
  sections.push("");

  sections.push(`Produce BOTH a caption and image generation instructions together, so they are creatively aligned.

Return ONLY valid JSON:
{
  "caption": "the full caption text without hashtags",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": {
    "scene": "${productScene
      ? `Natural language paragraph for ONE distinct concept conveying ${name}'s essence and THIS post's hook (use the Brand Story metaphor and Core Value). Lead with the main visual element; include setting, lighting, camera spec and brand colors woven naturally. No people, no readable text. Make each post visibly different in subject, composition and lighting — do NOT reuse a phone-next-to-coffee flatlay; the device is optional and any screen is textless-abstract. Vary the direction across posts, e.g.: the brand metaphor made visual; a single bold subject in vast negative space with a soft primary-tinted glow; a moody dark scene lit by one accent color; the product's domain objects arranged with calm intention.`
      : `Natural language paragraph describing an environment, abstract composition, or still-life that evokes the product's essence. Lead with the main visual element. Include setting, lighting, camera spec, and brand colors woven naturally. No people, no devices, no text. Example: 'A sunlit loft workspace with exposed brick walls and monstera plants, warm amber light pooling across a navy blue velvet surface with scattered gold geometric shapes, shot on 50mm f/2.0 with shallow depth of field.'`}",
    "brandColorUsage": "How brand colors appear in the scene (e.g. 'navy in the furniture, amber in the lighting')",
    "mood": "single word or short phrase — energetic, calm, luxurious, playful, professional, cozy, etc.",
    "style": "one of: photo-realistic, illustrated, minimal-graphic, cinematic, 3d-render, flat-design",
    "aspectRatio": "${aspectRatio}"
  }
}`);

  const metadata: GenerationMetadata = {
    hookUsed,
    pillarUsed,
    targetType,
    targetValue,
    toneConstraints,
    visualDirection,
  };

  return { prompt: sections.join("\n"), metadata };
}

// --- Brainstorming engine ---

export interface BrainstormOptions {
  count?: number;
  theme?: string;
  llmInstructions?: string;
}

/**
 * Brainstorming engine: generate innovative, non-obvious marketing/content ideas
 * from a product's profile + strategy. Injects the brainstorming knowledge pack.
 */
export function buildBrainstormPrompt(
  rawProfile: Record<string, unknown>,
  rawStrategy: Record<string, unknown>,
  opts: BrainstormOptions = {}
): string {
  const profile = normalizeProfile(rawProfile);
  const strategy = normalizeStrategy(rawStrategy);
  const count = Math.min(Math.max(opts.count ?? 8, 3), 15);

  const sections: string[] = [];

  sections.push(`You are a creative marketing strategist running a high-energy brainstorm for "${profile.name}".`);
  sections.push(`Your job: produce ${count} INNOVATIVE, non-obvious marketing and content ideas, ranging across campaigns, content series, single posts, and growth experiments. The obvious ideas are worthless here. Push past them.`);

  const skills = composeSkillSection("brainstorming");
  if (skills) sections.push(skills);

  sections.push("PRODUCT:");
  sections.push(`Name: ${profile.name}`);
  if (profile.tagline) sections.push(`Tagline: ${profile.tagline}`);
  if (profile.category) sections.push(`Category: ${profile.category}`);
  if (profile.coreValue) sections.push(`Core value: ${profile.coreValue}`);
  if (profile.differentiators?.length) sections.push(`Differentiators: ${profile.differentiators.join("; ")}`);
  if (profile.competitorContext) sections.push(`Competitive context: ${profile.competitorContext}`);
  if (profile.brandStory) sections.push(`Brand story: ${profile.brandStory}`);
  if (profile.audience?.primary) sections.push(`Audience: ${profile.audience.primary}`);

  if (profile.customerSegments?.length) {
    sections.push("\nSEGMENTS (mine these pains/desires):");
    for (const seg of profile.customerSegments) {
      sections.push(`- ${seg.label}: pains=[${seg.painPoints.join(", ")}], desires=[${seg.desires.join(", ")}], angle="${seg.messagingAngle}"`);
    }
  }

  if (strategy.painPoints?.length) sections.push(`\nPain points: ${strategy.painPoints.join("; ")}`);
  if (strategy.desirePoints?.length) sections.push(`Desires: ${strategy.desirePoints.join("; ")}`);
  if (strategy.contentPillars?.length) sections.push(`Content pillars: ${strategy.contentPillars.join("; ")}`);
  if (strategy.objections?.length) sections.push(`Objections to flip: ${strategy.objections.map(o => o.objection).join("; ")}`);

  const existingHooks = (strategy.hooks as CategorizedHook[]).map(h => h.text).filter(Boolean);
  if (existingHooks.length) {
    sections.push(`\nALREADY USED (the OBVIOUS baseline. Do NOT repeat these, beat them):`);
    sections.push(existingHooks.map(h => `- ${h}`).join("\n"));
  }

  if (opts.theme) {
    sections.push(`\nFOCUS THEME: orient the whole brainstorm around "${opts.theme}".`);
  }

  const userInstructions = composeUserInstructions(opts.llmInstructions);
  if (userInstructions) sections.push(`\n${userInstructions}`);

  sections.push(`\nSTYLE: hooks must sound human and specific. Never use the em dash character. Never use AI cliche words (elevate, unlock, unleash, seamlessly, revolutionize, empower, leverage, game-changer, cutting-edge, next-level).`);

  sections.push(`\nReturn ONLY a valid JSON array of exactly ${count} ideas, each from a DIFFERENT angle lens. No markdown, no commentary. Schema per idea:
{
  "title": "short, punchy name for the idea",
  "kind": "campaign | series | post | experiment",
  "hook": "the one-line opening or angle a viewer would actually see",
  "whyItWorks": "the job, pain, or emotion it taps and why it lands",
  "format": "content format and channel, e.g. 'Instagram Reel', 'X thread', '7-day challenge'",
  "riskiestAssumption": "the one belief that must be true for this to work",
  "scores": { "novelty": 1-5, "fit": 1-5, "feasibility": 1-5 }
}
Order best-first by novelty + fit. Exclude any idea scoring 1-2 on BOTH novelty and fit.`);

  return sections.join("\n");
}

/** Parse + validate the brainstorm engine's JSON array response. */
export function parseBrainstormResponse(response: string): BrainstormIdea[] {
  const cleaned = response.replace(/```(?:json)?\s*/gi, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const allowedKinds = ["campaign", "series", "post", "experiment"];
  const clampScore = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3; // NaN/missing -> neutral 3
  };

  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x): BrainstormIdea => {
      const s = (x.scores || {}) as Record<string, unknown>;
      const kind = String(x.kind || "post").toLowerCase();
      return {
        title: String(x.title || "").trim(),
        kind: (allowedKinds.includes(kind) ? kind : "post") as BrainstormKind,
        hook: String(x.hook || "").trim(),
        whyItWorks: String(x.whyItWorks || "").trim(),
        format: String(x.format || "").trim(),
        riskiestAssumption: String(x.riskiestAssumption || "").trim(),
        scores: {
          novelty: clampScore(s.novelty),
          fit: clampScore(s.fit),
          feasibility: clampScore(s.feasibility),
        },
      };
    })
    .filter(idea => idea.title && idea.hook);
}
