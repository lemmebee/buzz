export interface ProductPlan {
  name: string;
  description: string;
  audience: string;
  tone: string;
  visualStyle?: string;
}

export type Platform = "instagram" | "twitter";
export type ContentPurpose = "reel" | "post" | "story" | "carousel" | "ad";
export type MediaType = "image" | "video" | "audio";

export interface GenerationInput {
  product: ProductPlan;
  platform: Platform;
  purpose: ContentPurpose;
  mediaType: MediaType;
}

export interface GeneratedMedia {
  url: string;
  localPath?: string;
  type: MediaType;
}

export interface GeneratedText {
  caption: string;
  hashtags: string[];
  description?: string;
  script?: string;
}

export interface GenerationOutput {
  media: GeneratedMedia;
  text: GeneratedText;
}

// Targeting types
export type TargetType = "pain" | "desire" | "objection";

export interface ContentTargeting {
  hook?: string;
  pillar?: string;
  targetType?: TargetType;
  targetValue?: string;
}

export interface GenerationMetadata {
  hookUsed: string | null;
  pillarUsed: string | null;
  targetType: TargetType | null;
  targetValue: string | null;
  toneConstraints: string[];
  visualDirection: string;
}

// --- New profile types ---

export type PricePositioning = "premium" | "mid-market" | "budget" | "freemium";

export interface BrandPersonality {
  archetypes: string[];
  traits: string[];
  voiceDos: string[];
  voiceDonts: string[];
}

export interface CustomerSegment {
  label: string;
  painPoints: string[];
  desires: string[];
  messagingAngle: string;
}

export interface ProductProfile {
  name: string;
  tagline: string;
  category: string;
  coreValue: string;
  features: string[];
  audience: {
    primary: string;
    demographics: string;
    psychographics: string;
  };
  tone: string;
  visualIdentity: {
    style: string;
    colors: string;
    mood: string;
  };
  differentiators: string[];
  // New fields
  pricePositioning?: PricePositioning;
  brandPersonality?: BrandPersonality;
  competitorContext?: string;
  customerSegments?: CustomerSegment[];
  brandStory?: string;
}

// --- New strategy types ---

export type HookType = "curiosity" | "pain" | "desire" | "social-proof" | "contrarian";

export interface CategorizedHook {
  text: string;
  type: HookType;
}

export type ObjectionStage = "awareness" | "consideration" | "decision";

export interface StagedObjection {
  objection: string;
  counter: string;
  stage?: ObjectionStage;
}

export interface BrandVoice {
  dos: string[];
  donts: string[];
  samplePhrases: string[];
}

export interface CtaStrategy {
  goal: string;
  cta: string;
  context: string;
}

export interface MarketingStrategy {
  hooks: (string | CategorizedHook)[];
  themes: string[];
  contentPillars: string[];
  painPoints: string[];
  desirePoints: string[];
  objections: (StagedObjection | { objection: string; counter: string })[];
  toneGuidelines?: string;
  visualDirection: string;
  // New fields
  brandVoice?: BrandVoice;
  ctaStrategies?: CtaStrategy[];
}

export interface ImagePrompt {
  scene?: string;
  brandColorUsage?: string;
  mood?: string;
  style?: string;
  aspectRatio?: string;
}

export interface GeneratedContent {
  caption: string;
  hashtags?: string[];
  imagePrompt?: ImagePrompt;
}

// --- Normalizers: convert old-format data to new format ---

/** Normalize a raw profile from DB into ProductProfile with new fields defaulted */
export function normalizeProfile(raw: Record<string, unknown>): ProductProfile {
  const p = raw as Partial<ProductProfile> & Record<string, unknown>;

  return {
    name: (p.name as string) || "",
    tagline: (p.tagline as string) || "",
    category: (p.category as string) || "",
    coreValue: (p.coreValue as string) || "",
    features: (p.features as string[]) || [],
    audience: {
      primary: (p.audience as { primary?: string })?.primary || "",
      demographics: (p.audience as { demographics?: string })?.demographics || "",
      psychographics: (p.audience as { psychographics?: string })?.psychographics || "",
    },
    tone: (p.tone as string) || "",
    visualIdentity: {
      style: (p.visualIdentity as { style?: string })?.style || "",
      colors: (p.visualIdentity as { colors?: string })?.colors || "",
      mood: (p.visualIdentity as { mood?: string })?.mood || "",
    },
    differentiators: (p.differentiators as string[]) || [],
    pricePositioning: p.pricePositioning || undefined,
    brandPersonality: p.brandPersonality || undefined,
    competitorContext: (p.competitorContext as string) || undefined,
    customerSegments: p.customerSegments || undefined,
    brandStory: (p.brandStory as string) || undefined,
  };
}

/** Normalize a raw strategy from DB — converts flat string hooks to CategorizedHook[], etc. */
export function normalizeStrategy(raw: Record<string, unknown>): MarketingStrategy {
  const s = raw as Partial<MarketingStrategy> & Record<string, unknown>;

  // Normalize hooks: string[] → CategorizedHook[]
  const rawHooks = (s.hooks || []) as (string | CategorizedHook)[];
  const hooks: CategorizedHook[] = rawHooks.map(h => {
    if (typeof h === "string") {
      return { text: h, type: "curiosity" as HookType };
    }
    return h;
  });

  // Normalize objections: add default stage if missing
  const rawObjections = (s.objections || []) as (StagedObjection | { objection: string; counter: string })[];
  const objections: StagedObjection[] = rawObjections.map(o => ({
    objection: o.objection,
    counter: o.counter,
    stage: ("stage" in o ? o.stage : "consideration") as ObjectionStage,
  }));

  // Normalize brandVoice: fallback from toneGuidelines
  let brandVoice = s.brandVoice;
  if (!brandVoice && s.toneGuidelines) {
    const guidelines = (s.toneGuidelines as string)
      .split(/[,;.\n]/)
      .map(g => g.trim())
      .filter(g => g.length > 0);
    brandVoice = {
      dos: guidelines,
      donts: [],
      samplePhrases: [],
    };
  }

  return {
    hooks,
    themes: (s.themes as string[]) || [],
    contentPillars: (s.contentPillars as string[]) || [],
    painPoints: (s.painPoints as string[]) || [],
    desirePoints: (s.desirePoints as string[]) || [],
    objections,
    toneGuidelines: s.toneGuidelines || undefined,
    visualDirection: (s.visualDirection as string) || "",
    brandVoice,
    ctaStrategies: s.ctaStrategies || undefined,
  };
}
