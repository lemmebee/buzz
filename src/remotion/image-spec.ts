import { z } from "zod";
import { FONTS, type LayerT } from "./spec";

// ────────────────────────────────────────────────────────────────────────────
// Image creative director: ONE Zod schema, same pattern as VideoSpec.
//   • IMAGE_CATALOG_PROMPT describes it to the LLM
//   • ImageSpec.safeParse() is the render-vs-fallback gate
//   • every field auto-heals via .catch()/.default()
// Closed enums = guardrail: validated spec is always renderable.
// ────────────────────────────────────────────────────────────────────────────

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .catch("#ffffff");

const Font = z.enum(FONTS).catch("Inter");
const TextAnim = z.enum(["fadeUp", "pop", "typewriter", "slideLeft", "none"]).catch("fadeUp");
const Position = z.enum(["center", "top", "bottom", "upper-third", "lower-third"]).catch("center");
const Shape = z.enum(["rect", "circle", "ellipse", "triangle"]).catch("rect");

// Same layer shape as video, but animations are ignored (still = everything at rest).
const ImageLayer = z
  .object({
    kind: z.enum(["text", "shape"]).catch("text"),
    text: z.string().catch(""),
    position: Position,
    animation: TextAnim,
    fontFamily: Font,
    sizePct: z.number().min(2).max(22).catch(8),
    color: Hex,
    accent: z.boolean().catch(false),
    uppercase: z.boolean().catch(false),
    shape: Shape,
    xPct: z.number().min(-10).max(110).catch(50),
    yPct: z.number().min(-10).max(110).catch(50),
    widthPct: z.number().min(1).max(140).catch(40),
    heightPct: z.number().min(1).max(140).catch(20),
    opacity: z.number().min(0).max(1).catch(1),
  })
  .catch({
    kind: "text",
    text: "",
    position: "center",
    animation: "fadeUp",
    fontFamily: "Inter",
    sizePct: 8,
    color: "#ffffff",
    accent: false,
    uppercase: false,
    shape: "rect",
    xPct: 50,
    yPct: 50,
    widthPct: 40,
    heightPct: 20,
    opacity: 1,
  });

export const ImageSpec = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9", "4:5"]).catch("1:1"),
  palette: z
    .object({ bg: Hex, accent: Hex, text: Hex })
    .catch({ bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" }),
  // Background: real asset OR generated OR gradient/color
  bgKind: z.enum(["product", "uploaded", "generated", "gradient", "color"]).catch("generated"),
  bgImagePrompt: z.string().catch(""),
  bgImageIndex: z.number().min(0).catch(0),
  bgColor: Hex,
  bgColor2: Hex,
  layers: z.array(ImageLayer).max(8).catch([]),
});

export type ImageSpecT = z.infer<typeof ImageSpec>;

// ─── Render-time props (what ImageComposition consumes) ──────────────────────
// bgKind is resolved: "product"/"uploaded"/"generated" → "image" with a real src.
export type ResolvedImageBgKind = "image" | "gradient" | "color";

// MUST be a `type` (not interface) for Remotion's Record<string,unknown> constraint.
export type ResolvedImageSpec = {
  bgKind: ResolvedImageBgKind;
  bgImageSrc?: string;
  // Photos fill the frame; product screenshots are letterboxed so they aren't
  // cropped to an arbitrary middle slice.
  bgFit: "cover" | "contain";
  bgColor: string;
  bgColor2: string;
  layers: LayerT[];
  palette: { bg: string; accent: string; text: string };
  width: number;
  height: number;
};

// MUST be a `type` (not interface) for Remotion's Record<string,unknown> constraint.
export type ImageCompositionProps = ResolvedImageSpec & {
  // Remotion still needs these for the composition metadata
  fps: number;
  durationInFrames: number;
};

export const IMAGE_COMPOSITION_ID = "ImageComposition";

export const DEFAULT_IMAGE_PROPS: ImageCompositionProps = {
  bgKind: "color",
  bgFit: "cover",
  bgColor: "#0b0b0f",
  bgColor2: "#1b1b2f",
  layers: [],
  palette: { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" },
  width: 1080,
  height: 1080,
  fps: 30,
  durationInFrames: 1,
};

// ─── Catalog prompt for the image creative director ──────────────────────────

export const IMAGE_CATALOG_PROMPT = `You are the CREATIVE DIRECTOR of a single-frame social media image — a bold, scroll-stopping still that communicates value in one glance. Output ONE JSON object matching this spec.

THIS IS A STILL IMAGE, not a video. Design for instant impact: one clear focal point, bold typography, high contrast. The viewer decides in <1 second whether to stop scrolling.

TOP-LEVEL:
- aspectRatio: "9:16" | "1:1" | "16:9" | "4:5"  (default "1:1")
- palette: { bg, accent, text }  — hex colors (#RRGGBB). Pull from the brand. accent is the pop color.
- bgKind: "product" | "uploaded" | "generated" | "gradient" | "color"
- bgImagePrompt: if bgKind="generated", a vivid cinematic photo prompt. Calm/uncluttered with room for text. No on-screen text in the image.
- bgImageIndex: 0-based index into the available asset pool (see ASSETS below)
- bgColor / bgColor2: hex colors for gradient/color backgrounds
- layers: 1-6 text/shape elements

ASSETS AVAILABLE:
{{ASSETS_DIRECTIVE}}

LAYER TYPES:
- TEXT layer: { kind:"text", text, position:("center"|"top"|"bottom"|"upper-third"|"lower-third"), animation:(ignored for stills), fontFamily, sizePct:(2-22, % of height; hero text ~10-18), color, accent:(true=use palette.accent), uppercase }
- SHAPE layer: { kind:"shape", shape:("rect"|"circle"|"ellipse"|"triangle"), color, xPct,yPct (center, 0-100), widthPct,heightPct, opacity }

FONTS allowed: ${FONTS.join(", ")}.

LAYOUT RULES (critical):
- AT MOST ONE hero text (sizePct 10-18). Any additional text must be a small kicker/label (sizePct 3-6) in a DIFFERENT zone.
- Keep hero lines SHORT (2-6 words). Long copy kills impact.
- Use position zones to separate elements: hero in ONE of center/upper-third/lower-third; kicker in a different zone.
- High contrast: light text on dark bg, or dark text on light bg. Never low-contrast.
- Use REAL assets (product/uploaded) when they exist — authenticity beats generation.
- Leave breathing room. Don't fill every pixel.

DESIGN PRINCIPLES:
- One clear focal point. The eye should land immediately.
- Bold typography that reads at social-media scroll speed.
- Use the brand palette consistently.
- Shapes are accents/backing cards — they support the text, not compete with it.
- Respect safe margins — never push text to the very edge.

- Output ONLY the JSON object. No prose, no markdown fences.`;

// Directive appended when product screenshots are available
function productShotsDirective(count: number): string {
  return `PRODUCT SHOTS: ${count} real screenshot(s) of the ACTUAL product are available. To show the app/product, set bgKind to "product" and bgImageIndex to 0-${count - 1}. This uses a REAL screenshot — much more authentic than generating a fake one. Use product shots for "here's what it looks like" moments.`;
}

// Directive appended when user-uploaded images are available
function uploadedImagesDirective(count: number): string {
  return `USER UPLOADS: ${count} custom image(s) uploaded by the user. To feature them, set bgKind to "uploaded" and bgImageIndex to 0-${count - 1}. These are user-provided assets — use them prominently, they specifically asked to include them.`;
}

// Directive when NO real assets are available
function noAssetsDirective(): string {
  return `NO REAL ASSETS: No product screenshots or user uploads available. Use bgKind "generated" for atmospheric backgrounds, or "gradient"/"color" for bold typographic compositions. Let the typography BE the art.`;
}

// Build the full catalog prompt with asset awareness
export function buildImageCatalogPrompt(opts: {
  productShots: number;
  uploadedImages: number;
}): string {
  let assetsDirective: string;
  if (opts.productShots === 0 && opts.uploadedImages === 0) {
    assetsDirective = noAssetsDirective();
  } else {
    const parts: string[] = [];
    if (opts.productShots > 0) parts.push(productShotsDirective(opts.productShots));
    if (opts.uploadedImages > 0) parts.push(uploadedImagesDirective(opts.uploadedImages));
    parts.push(`You may also use bgKind "generated" for atmospheric backgrounds where real assets don't fit, or "gradient"/"color" for bold typographic pieces.`);
    assetsDirective = parts.join("\n\n");
  }
  return IMAGE_CATALOG_PROMPT.replace("{{ASSETS_DIRECTIVE}}", assetsDirective);
}

// ─── Helper: resolve bgImageIndex bounds ─────────────────────────────────────
export function clampImageIndex(index: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return Math.max(0, Math.min(index, poolSize - 1));
}
