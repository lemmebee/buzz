import type { ProductPlan, Platform, ContentPurpose, MediaType } from "./types";

// Platform-specific rules and best practices
const PLATFORM_RULES: Record<Platform, string> = {
  instagram: `Instagram Rules:
- Reels: Hook in first 3 seconds, 15-90 seconds optimal, vertical 9:16
- Posts: Square or vertical, carousel performs best, 2200 char caption limit
- Stories: 15-second segments, interactive stickers boost engagement
- Hashtags: 3-5 highly relevant > 30 generic, mix popular + niche
- Peak times: 11am-1pm, 7pm-9pm local time
- Tone: Authentic, visually polished, aspirational but relatable`,

  tiktok: `TikTok Rules:
- Hook in first 1-2 seconds or lose viewer
- Optimal length: 21-34 seconds for algorithm boost
- Trending sounds increase reach 2-3x
- Native/raw aesthetic outperforms polished content
- Hashtags: 3-5 max, include #fyp variations sparingly
- Duets and stitches drive organic reach
- Tone: Entertaining first, promotional second`,

  youtube: `YouTube Rules:
- Shorts: Under 60 seconds, vertical, loop-friendly
- Thumbnails: High contrast, faces, minimal text
- First 30 seconds determine retention
- SEO: Title, description, tags all matter
- Cards and end screens for engagement
- Tone: Value-driven, personality-forward`,
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

// System prompt for extracting app profile + marketing strategy from brief + screenshots
export function buildProfileAndStrategyPrompt(planFileContent: string): string {
  return `You are an expert marketing strategist. You will receive a marketing brief (and possibly app screenshots).

Analyze everything and extract two things:

1. APP PROFILE — structured JSON describing the product:
{
  "name": "string",
  "tagline": "string — one-liner value prop",
  "category": "string — app category",
  "coreValue": "string — the #1 benefit",
  "features": ["string — key features"],
  "audience": {
    "primary": "string — main target",
    "demographics": "string — age, context",
    "psychographics": "string — mindset, values"
  },
  "tone": "string — brand voice",
  "visualIdentity": {
    "style": "string — design language",
    "colors": "string — palette description",
    "mood": "string — emotional feel"
  },
  "differentiators": ["string — what makes it unique"]
}

2. MARKETING STRATEGY — structured JSON with content strategy:
{
  "hooks": ["string — 5 scroll-stopping hooks"],
  "themes": ["string — recurring content themes"],
  "contentPillars": ["string — 3-4 content categories"],
  "painPoints": ["string — audience problems this solves"],
  "desirePoints": ["string — aspirations this fulfills"],
  "objections": [{"objection": "string", "counter": "string"}],
  "toneGuidelines": "string — how to write in this brand's voice",
  "visualDirection": "string — how images should feel"
}

Marketing Brief:
${planFileContent}

If screenshots are provided, use them to inform visual identity, features, and UI style.

Return ONLY valid JSON:
{
  "appProfile": { ... },
  "marketingStrategy": { ... }
}`;
}

// Unified content generation prompt — produces caption + image instructions in one call
export function buildContentGenerationPrompt(
  appProfile: Record<string, unknown>,
  marketingStrategy: Record<string, unknown>,
  screenshotCount: number,
  platform: Platform,
  contentType: ContentPurpose
): string {
  const aspectRatio =
    contentType === "post" && platform === "instagram" ? "1:1 square" : "9:16 vertical";

  return `You are a creative director producing a single ${platform} ${contentType}.

APP PROFILE:
${JSON.stringify(appProfile, null, 2)}

MARKETING STRATEGY:
${JSON.stringify(marketingStrategy, null, 2)}

${PLATFORM_RULES[platform]}

${CONTENT_FORMULAS[contentType]}

${screenshotCount > 0 ? `You have ${screenshotCount} app screenshots attached. Use them as creative assets — you decide how:
- Feature a screenshot as the hero image
- Use screenshots as reference for describing the UI in the caption
- Combine multiple screenshots in a collage-style composition
- Use them as background/context elements
- Or ignore them if the content works better without` : "No screenshots available."}

Produce BOTH a caption and image generation instructions together, so they are creatively aligned.

Return ONLY valid JSON:
{
  "caption": "the full caption text without hashtags",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": {
    "scene": "detailed description of the image to generate",
    "screenshotUsage": "how screenshots should be incorporated (or 'none')",
    "mood": "emotional tone of the image",
    "style": "visual style (photo-realistic, illustrated, minimal, etc.)",
    "aspectRatio": "${aspectRatio}",
    "textOverlay": "any text to render on the image, or null"
  }
}`;
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

${platform === "tiktok" ? "TikTok: Max 5 hashtags, avoid overused #fyp spam" : ""}
${platform === "instagram" ? "Instagram: 5-10 hashtags optimal, avoid banned tags" : ""}
${platform === "youtube" ? "YouTube: Tags go in video settings, focus on searchability" : ""}

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
