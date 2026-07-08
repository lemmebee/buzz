import { jsonrepair } from "jsonrepair";
import type { TextProvider } from "@/lib/providers/types";
import { composeSkillSection } from "@/lib/skills";
import {
  buildImageCatalogPrompt,
  ImageSpec,
  type ImageSpecT,
} from "@/remotion/image-spec";
import type { LayerT } from "@/remotion/spec";

// Bold display faces for hero text
const DISPLAY_FONTS = ["Anton", "Bebas Neue", "Archivo Black", "Montserrat", "Oswald"] as const;
const HERO_POSITIONS: LayerT["position"][] = ["center", "upper-third", "lower-third"];

export interface ImageAuthorInput {
  productName: string;
  profile: unknown;
  strategy: unknown;
  vibe: string;
  aspectRatio: string;
  productShots: number;
  uploadedImages: number;
  // Optional: a caption or script to derive hero text from
  caption?: string;
}

export interface ImageAuthorResult {
  spec: ImageSpecT | null;
  raw: string;
  error?: string;
}

function buildImageUserPrompt(input: ImageAuthorInput, angleHint?: string): string {
  const angle = angleHint ? `\n\nCREATIVE ANGLE FOR THIS VARIANT: ${angleHint}` : "";
  const captionDirective = input.caption
    ? `\n\nUSE THIS CAPTION/MESSAGE AS INSPIRATION FOR THE HERO TEXT:\n"${input.caption}"`
    : "";
  return `Design a single-frame social media image for "${input.productName}".

VIBE / CREATIVE DIRECTION: ${input.vibe}

BRAND PROFILE:
${JSON.stringify(input.profile)}

MARKETING STRATEGY:
${JSON.stringify(input.strategy)}

Set aspectRatio="${input.aspectRatio}".${captionDirective}${angle}

Output ONLY the JSON object — no prose, no markdown fences.`;
}

function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

function parseToObject(raw: string): { value: unknown } | { error: string } {
  const t = extractJson(raw);
  try {
    return { value: JSON.parse(t) };
  } catch {
    try {
      return { value: JSON.parse(jsonrepair(t)) };
    } catch (err) {
      return { error: `unparseable JSON: ${err instanceof Error ? err.message : err}` };
    }
  }
}

// Force the requested aspect ratio and guarantee typography.
function finalizeSpec(data: ImageSpecT, input: ImageAuthorInput): ImageSpecT {
  const aspectRatio = (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
    ? input.aspectRatio
    : "1:1") as ImageSpecT["aspectRatio"];

  // On product/uploaded backgrounds, shrink text so the asset shines
  const isRealAsset = data.bgKind === "product" || data.bgKind === "uploaded";
  const layers = isRealAsset
    ? data.layers.map((l) =>
        l.kind === "text"
          ? { ...l, sizePct: Math.min(l.sizePct, 8), position: "lower-third" as const, uppercase: true }
          : l
      )
    : data.layers;

  return guaranteeTypography({ ...data, aspectRatio, layers }, input.productName);
}

// Guarantee at least one text layer
function guaranteeTypography(spec: ImageSpecT, productName: string): ImageSpecT {
  const hasText = spec.layers.some((l) => l.kind === "text" && l.text.trim().length > 0);
  if (hasText) return spec;
  const hero: LayerT = {
    kind: "text",
    text: productName.split(/\s+/).slice(0, 4).join(" ").toUpperCase(),
    position: HERO_POSITIONS[0],
    animation: "none",
    fontFamily: DISPLAY_FONTS[0],
    sizePct: 14,
    color: spec.palette.text,
    accent: false,
    uppercase: true,
    shape: "rect",
    xPct: 50,
    yPct: 50,
    widthPct: 40,
    heightPct: 20,
    opacity: 1,
  };
  return { ...spec, layers: [...spec.layers, hero] };
}

async function authorImageOnce(
  provider: TextProvider,
  input: ImageAuthorInput,
  angleHint?: string
): Promise<ImageAuthorResult> {
  const systemPrompt =
    buildImageCatalogPrompt({
      productShots: input.productShots,
      uploadedImages: input.uploadedImages,
    }) + composeSkillSection("video-direction");
  const baseUser = buildImageUserPrompt(input, angleHint);
  let lastError = "";
  let raw = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYOUR PREVIOUS OUTPUT WAS REJECTED: ${lastError}\nReturn the corrected JSON object only.`;
    try {
      const res = await provider.generate({ systemPrompt, userPrompt });
      raw = res.text;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    const parsed = parseToObject(raw);
    if ("error" in parsed) {
      lastError = parsed.error;
      continue;
    }
    const result = ImageSpec.safeParse(parsed.value);
    if (!result.success) {
      lastError = `schema validation failed: ${result.error.message.slice(0, 200)}`;
      continue;
    }
    return { spec: finalizeSpec(result.data, input), raw };
  }
  return { spec: null, raw, error: lastError };
}

// Distinct creative angles for image variants
const IMAGE_ANGLES = [
  "BOLD TYPOGRAPHY angle: make the words the hero. Large, punchy text on a clean background. Minimal imagery, maximum impact.",
  "PRODUCT HERO angle: showcase the actual product/app prominently. Clean composition that lets the real asset shine with supporting text.",
  "MOOD/ATMOSPHERE angle: evocative background with overlaid text. Create a feeling first, message second. Gradient or generated backgrounds work well.",
  "MINIMALIST angle: maximum negative space. One focal point. Let the design breathe. Less is more.",
];

interface ImageSpecSummary {
  bg: string;
  hero: string;
  kicker: string;
  layerCount: number;
}

function summarizeForJudge(spec: ImageSpecT): ImageSpecSummary {
  const texts = spec.layers.filter((l) => l.kind === "text" && l.text.trim());
  const hero = texts.find((l) => l.sizePct >= 8)?.text ?? texts[0]?.text ?? "";
  const kicker = texts.find((l) => l.sizePct < 8)?.text ?? "";
  return { bg: spec.bgKind, hero, kicker, layerCount: spec.layers.length };
}

function heuristicBestIndex(specs: ImageSpecT[]): number {
  const score = (spec: ImageSpecT): number => {
    let s = 0;
    const texts = spec.layers.filter((l) => l.kind === "text" && l.text.trim());
    const heroes = texts.filter((l) => l.sizePct >= 8);
    if (heroes.length === 1) s += 2;
    if (heroes.some((h) => h.text.trim().split(/\s+/).length <= 5)) s += 1;
    if (spec.bgKind === "product" || spec.bgKind === "uploaded") s += 1;
    if (spec.layers.length >= 2 && spec.layers.length <= 5) s += 0.5;
    s += new Set([spec.bgKind]).size * 0.5;
    return s;
  };
  let best = 0;
  let bestScore = -Infinity;
  specs.forEach((spec, i) => {
    const sc = score(spec);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  });
  return best;
}

async function judgeImageSpecs(
  provider: TextProvider,
  input: ImageAuthorInput,
  specs: ImageSpecT[]
): Promise<number> {
  const candidates = specs.map((s, i) => ({ index: i, ...summarizeForJudge(s) }));
  const systemPrompt =
    "You are a ruthless creative director reviewing candidate social media image designs. Pick the ONE that would perform best as a scroll-stopping post. Apply: visual impact, clarity of message, brand consistency, use of real assets. When candidates tie, the braver idea wins. Respond with ONLY a JSON object: {\"winner\": <index>, \"reason\": \"<one line>\"}." +
    composeSkillSection("video-judge");
  const userPrompt = `Product: ${input.productName}\nVibe: ${input.vibe}\nCaption: ${input.caption ?? ""}\n\nCANDIDATES (JSON):\n${JSON.stringify(candidates)}\n\nReturn the winning index as JSON.`;
  try {
    const res = await provider.generate({ systemPrompt, userPrompt });
    const parsed = parseToObject(res.text);
    if (!("error" in parsed) && parsed.value && typeof parsed.value === "object") {
      const w = (parsed.value as { winner?: unknown }).winner;
      if (typeof w === "number" && w >= 0 && w < specs.length) {
        console.log(`[image-spec] judge picked variant ${w} of ${specs.length}`);
        return w;
      }
    }
  } catch (err) {
    console.warn(`[image-spec] judge failed, using heuristic: ${err instanceof Error ? err.message : err}`);
  }
  return heuristicBestIndex(specs);
}

export interface ImageAuthorBestInput extends ImageAuthorInput {
  provider: TextProvider;
  n?: number;
  fallbackPalette?: { bg: string; accent: string; text: string };
}

export interface ImageAuthorBestResult {
  spec: ImageSpecT;
  source: "judged" | "single" | "deterministic";
  valid: number;
}

// Best-of-N + judge with deterministic floor.
export async function authorBestImageSpec(
  input: ImageAuthorBestInput
): Promise<ImageAuthorBestResult> {
  const n = Math.max(1, Math.min(input.n ?? 3, IMAGE_ANGLES.length));
  const variants = await Promise.all(
    Array.from({ length: n }, (_, i) => authorImageOnce(input.provider, input, IMAGE_ANGLES[i]))
  );
  const valid = variants.map((v) => v.spec).filter((s): s is ImageSpecT => s !== null);
  console.log(`[image-spec] best-of-${n} via ${input.provider.name}: ${valid.length} valid variant(s)`);

  if (valid.length === 0) {
    // Deterministic fallback: bold typography on brand gradient
    const palette = input.fallbackPalette ?? { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" };
    const fallbackSpec: ImageSpecT = {
      aspectRatio: (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
        ? input.aspectRatio
        : "1:1") as ImageSpecT["aspectRatio"],
      palette,
      bgKind: "gradient",
      bgImagePrompt: "",
      bgImageIndex: 0,
      bgColor: palette.bg,
      bgColor2: palette.accent,
      layers: [
        {
          kind: "text",
          text: input.productName.split(/\s+/).slice(0, 4).join(" ").toUpperCase(),
          position: "center",
          animation: "none",
          fontFamily: DISPLAY_FONTS[0],
          sizePct: 14,
          color: palette.text,
          accent: false,
          uppercase: true,
          shape: "rect",
          xPct: 50,
          yPct: 50,
          widthPct: 40,
          heightPct: 20,
          opacity: 1,
        },
      ],
    };
    return { spec: fallbackSpec, source: "deterministic", valid: 0 };
  }

  if (valid.length === 1) return { spec: valid[0], source: "single", valid: 1 };

  const winner = await judgeImageSpecs(input.provider, input, valid);
  return { spec: valid[winner], source: "judged", valid: valid.length };
}
