import type { ProductPlan, Platform, ContentPurpose, MediaType, ContentTargeting, GenerationMetadata, CategorizedHook, HookType, BrandVoice } from "./types";
import { normalizeProfile, normalizeStrategy } from "./types";

// Platform-specific rules and best practices
const PLATFORM_RULES: Record<Platform, string> = {
  instagram: `Instagram Rules:
- Reels: Hook in first 3 seconds, 15-90 seconds optimal, vertical 9:16
- Posts: Square or vertical, carousel performs best, 2200 char caption limit
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

  carousel: `Carousel Formula:
1. Slide 1: Thumb-stopping hook, promise of value
2. Slides 2-8: One idea per slide, visual consistency
3. Second-to-last: Summary or key takeaway
4. Last slide: Strong CTA, save/share prompt`,

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
}

export function buildProfileAndStrategyPrompt({ name, description, planFileContent }: ExtractionInput): string {
  return `You are an expert marketing strategist extracting a deep product profile and content strategy from a marketing brief.

## PHASE 1 — THINK (internal analysis, do NOT output this)

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
- GOOD: "You spent 4 hours on a carousel that got 12 likes. Here's why." ← specific, stings, curious

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
- brandVoice.samplePhrases: 5-8`;
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
  carousel: ["pain", "curiosity", "social-proof"],
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
  productName?: string
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
      carousel: ["save", "share", "follow"],
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

  if (screenshotCount > 0) {
    sections.push(`You have ${screenshotCount} uploaded image(s) attached.

IMAGE CLASSIFICATION — for EACH image, determine its type:

A) FEATURE SPOTLIGHT (app screen, UI screenshot, product feature, dashboard, product photo)
   → CAPTION: reference specific UI elements, features, or experiences visible. Be concrete.
   → IMAGE PROMPT: translate the feature's purpose into a visual metaphor or marketing scene. Do NOT recreate the UI literally. Example: a task management board → an organized desk with neatly arranged objects.

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
- NEVER include text, lettering, words, or typography in the scene — Flux cannot render text correctly
- Focus on products, objects, environments, abstract compositions, and still-life setups instead`);
  sections.push("");

  sections.push(`Produce BOTH a caption and image generation instructions together, so they are creatively aligned.

Return ONLY valid JSON:
{
  "caption": "the full caption text without hashtags",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": {
    "scene": "Natural language paragraph describing an environment, abstract composition, or still-life that evokes the product's essence. Lead with the main visual element. Include setting, lighting, camera spec, and brand colors woven naturally. No people, no devices, no text. Example: 'A sunlit loft workspace with exposed brick walls and monstera plants, warm amber light pooling across a navy blue velvet surface with scattered gold geometric shapes, shot on 50mm f/2.0 with shallow depth of field.'",
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

// System prompt for product analysis
export function buildAnalysisPrompt(product: ProductPlan): string {
  return `You are an expert marketing strategist analyzing a product for content creation.

Product: ${product.name}
Description: ${product.description}
Target Audience: ${product.audience}
Brand Tone: ${product.tone}
${product.visualStyle ? `Visual Style: ${product.visualStyle}` : ""}

Analyze this product and extract:
1. PRIMARY HOOK: The single most compelling benefit that stops scrolling
2. SECONDARY HOOKS: 3-5 alternate angles for content variety
3. PAIN POINTS: What problems does the audience have that this solves?
4. DESIRE POINTS: What aspirations does this fulfill?
5. DIFFERENTIATORS: What makes this unique from competitors?
6. PROOF POINTS: Credibility elements, results, social proof available
7. OBJECTIONS: Common hesitations and how to address them

Be specific and actionable. Every insight should translate directly to content.`;
}

// System prompt for caption generation
export function buildCaptionPrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose
): string {
  return `You are a top-tier social media copywriter specializing in ${platform}.

${PLATFORM_RULES[platform]}

${CONTENT_FORMULAS[purpose]}

Product Context:
- Product: ${product.name}
- Core Value: ${product.description}
- Audience: ${product.audience}
- Brand Tone: ${product.tone}

Write a ${purpose} caption for ${platform}.

Requirements:
- Match the ${product.tone} tone exactly
- Lead with a hook that stops the scroll
- Include a clear CTA appropriate for ${purpose}
- Keep it scannable with line breaks
- DO NOT include hashtags in the caption - return those separately

Return JSON:
{
  "caption": "the full caption text without hashtags",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;
}

// System prompt for hashtag strategy
export function buildHashtagPrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose
): string {
  return `You are a social media growth expert optimizing hashtag strategy.

Platform: ${platform}
Content Type: ${purpose}
Product: ${product.name}
Audience: ${product.audience}

Generate a strategic hashtag set:
- 2-3 broad/popular tags (500k-5M posts) for discovery
- 3-4 niche tags (50k-500k posts) for targeted reach
- 2-3 micro tags (<50k posts) for engagement
- 1-2 branded/unique tags if applicable

${platform === "instagram" ? "Instagram: 5-10 hashtags optimal, avoid banned tags" : ""}
${platform === "twitter" ? "Twitter: 1-2 hashtags max, more looks spammy" : ""}

Return JSON array of hashtags without # symbol: ["tag1", "tag2", ...]`;
}

// System prompt for image generation
export function buildImagePrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose
): string {
  const aspectRatio =
    purpose === "post" && platform === "instagram" ? "1:1 square" : "9:16 vertical";

  return `You are a creative director crafting an image prompt for AI generation.

Product: ${product.name}
Description: ${product.description}
Visual Style: ${product.visualStyle || "modern, clean, professional"}
Platform: ${platform}
Purpose: ${purpose}
Aspect Ratio: ${aspectRatio}

Create a detailed image generation prompt that:
- Captures the product's essence and appeal
- Matches the ${product.visualStyle || "brand"} aesthetic
- Works for ${platform} ${purpose} format
- Appeals to: ${product.audience}

Be specific about:
- Composition and framing
- Lighting and mood
- Color palette
- Style (photo-realistic, illustrated, etc.)
- Any text overlay needs

Return a single detailed prompt string optimized for image AI.`;
}

// System prompt for video generation
export function buildVideoPrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose
): string {
  return `You are a video creative director designing an AI video prompt.

${PLATFORM_RULES[platform]}

${CONTENT_FORMULAS[purpose]}

Product: ${product.name}
Description: ${product.description}
Visual Style: ${product.visualStyle || "modern, dynamic"}
Audience: ${product.audience}
Tone: ${product.tone}

Create a video generation prompt that describes:
1. OPENING SHOT: The hook visual (first 3 seconds)
2. SCENE PROGRESSION: Key visual moments
3. STYLE: Mood, pacing, transitions
4. PRODUCT INTEGRATION: How/when product appears
5. CLOSING: Final frame/CTA visual

Format: Detailed description suitable for video AI generation.
Keep it achievable - AI video has limitations.`;
}

// System prompt for script writing (video/audio)
export function buildScriptPrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose,
  mediaType: MediaType
): string {
  const duration =
    purpose === "reel" || purpose === "story"
      ? "15-30 seconds"
      : purpose === "ad"
        ? "30-60 seconds"
        : "30-90 seconds";

  return `You are a direct-response copywriter writing a ${mediaType} script.

${PLATFORM_RULES[platform]}

${CONTENT_FORMULAS[purpose]}

Product: ${product.name}
Value Prop: ${product.description}
Audience: ${product.audience}
Tone: ${product.tone}
Target Duration: ${duration}

Write a script that:
- Hooks immediately (first line is crucial)
- Speaks directly to ${product.audience}
- Maintains ${product.tone} tone throughout
- ${mediaType === "audio" ? "Works as voiceover - no visual cues" : "Includes brief visual/action notes"}
- Ends with clear CTA

Return JSON:
{
  "script": "the full script text",
  "duration": "estimated read time in seconds",
  "notes": "production notes if any"
}`;
}

// System prompt for audio/voiceover generation
export function buildAudioPrompt(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose
): string {
  return `You are an audio creative director designing a voiceover prompt.

Product: ${product.name}
Brand Tone: ${product.tone}
Audience: ${product.audience}
Platform: ${platform}
Purpose: ${purpose}

Describe the ideal voiceover:
1. VOICE TYPE: Gender, age range, accent
2. DELIVERY: Pace, energy level, emotion
3. STYLE: Conversational, authoritative, friendly, etc.
4. MUSIC: Background music style if needed
5. SOUND DESIGN: Any effects or ambiance

Match these to the ${product.tone} brand tone and ${product.audience} audience.

Return JSON:
{
  "voiceDescription": "detailed voice characteristics",
  "deliveryNotes": "how to deliver the script",
  "musicStyle": "background music description or null",
  "soundEffects": "any sound design notes or null"
}`;
}

// Master prompt builder - combines relevant prompts for a generation request
export function buildGenerationPrompts(
  product: ProductPlan,
  platform: Platform,
  purpose: ContentPurpose,
  mediaType: MediaType
): {
  captionPrompt: string;
  mediaPrompt: string;
  scriptPrompt?: string;
  audioPrompt?: string;
} {
  const result: ReturnType<typeof buildGenerationPrompts> = {
    captionPrompt: buildCaptionPrompt(product, platform, purpose),
    mediaPrompt:
      mediaType === "image"
        ? buildImagePrompt(product, platform, purpose)
        : buildVideoPrompt(product, platform, purpose),
  };

  if (mediaType === "video" || mediaType === "audio") {
    result.scriptPrompt = buildScriptPrompt(product, platform, purpose, mediaType);
  }

  if (mediaType === "audio") {
    result.audioPrompt = buildAudioPrompt(product, platform, purpose);
  }

  return result;
}
