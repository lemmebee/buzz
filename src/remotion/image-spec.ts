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

// ─── Layout vocabulary ───────────────────────────────────────────────────────
// Archetypes from the standard poster/advertising layout taxonomy. Each one is
// a whole composition, not a coordinate: it decides alignment, which band the
// type occupies, and how the legibility treatment is drawn.
export const ARCHETYPES = [
  "centered-axial",
  "bottom-strip",
  "type-as-image",
  "corner-anchored",
  "big-type-small-caption",
  "knockout-block",
  "split",
] as const;
export type ArchetypeT = (typeof ARCHETYPES)[number];

// Decor is RELATIONAL. A shape is defined by what it serves, never by where it
// sits. The old free-floating {shape, xPct, yPct} let the model drop a green
// rectangle into empty space because it had no word for "colour field behind
// the headline" — so it said "rectangle at 50,65" instead.
export const DECOR_ROLES = ["accent-bar", "underline", "frame"] as const;

const Decor = z
  .object({
    role: z.enum(DECOR_ROLES).catch("accent-bar"),
    color: Hex,
    accent: z.boolean().catch(true),
  })
  .catch({ role: "accent-bar", color: "#ffffff", accent: true });

// ─── Product showcase ────────────────────────────────────────────────────────
// A real product screenshot COMPOSED INTO the layout as an element, rather than
// stretched behind everything as wallpaper. It flows in a band like a text
// layer, so it can never collide with type and is never buried under a scrim.
export const SHOWCASE_TREATMENTS = ["device-frame", "floating-card", "cropped-detail"] as const;
export type ShowcaseTreatmentT = (typeof SHOWCASE_TREATMENTS)[number];

const Showcase = z.object({
  treatment: z.enum(SHOWCASE_TREATMENTS).catch("device-frame"),
  imageIndex: z.number().min(0).catch(0),
  position: Position,
  // Slight rotation reads as art-directed; beyond ~12° it reads as a mistake.
  tilt: z.number().min(-12).max(12).catch(0),
});

export const ImageSpec = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9", "4:5"]).catch("1:1"),
  archetype: z.enum(ARCHETYPES).catch("centered-axial"),
  align: z.enum(["left", "center"]).catch("center"),
  decor: z.array(Decor).max(2).catch([]),
  showcase: Showcase.nullable().catch(null),
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
export type DecorT = { role: (typeof DECOR_ROLES)[number]; color: string; accent: boolean };

// Render-time showcase: imageIndex already resolved to a real asset src, and the
// screenshot MEASURED (width/height) so the device body can take the asset's own
// aspect. A hardcoded phone aspect crops the app's own UI down its sides.
export type ResolvedShowcase = {
  treatment: ShowcaseTreatmentT;
  src: string;
  position: LayerT["position"];
  tilt: number;
  aspect: number; // screenshot width / height
};

export type ResolvedImageSpec = {
  bgKind: ResolvedImageBgKind;
  bgImageSrc?: string;
  // Photos fill the frame; product screenshots are letterboxed so they aren't
  // cropped to an arbitrary middle slice.
  bgFit: "cover" | "contain";
  bgColor: string;
  bgColor2: string;
  archetype: ArchetypeT;
  align: "left" | "center";
  decor: DecorT[];
  showcase?: ResolvedShowcase;
  layers: LayerT[];
  palette: { bg: string; accent: string; text: string };
  width: number;
  height: number;
};

// How each archetype composes. `band` overrides where type sits; `plate` is the
// legibility treatment over imagery: a full-width strip, a card hugging the
// type, a solid accent block, or nothing (for backgrounds that need no scrim).
export interface Composition {
  align: "left" | "center";
  band?: "upper" | "middle" | "lower";
  plate: "strip" | "hug" | "block" | "none";
}

export const COMPOSITION: Record<ArchetypeT, Composition> = {
  "centered-axial": { align: "center", band: "middle", plate: "hug" },
  "bottom-strip": { align: "left", band: "lower", plate: "strip" },
  "type-as-image": { align: "left", plate: "none" },
  "corner-anchored": { align: "left", band: "lower", plate: "hug" },
  "big-type-small-caption": { align: "left", plate: "hug" },
  "knockout-block": { align: "left", band: "lower", plate: "block" },
  split: { align: "left", band: "lower", plate: "strip" },
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
  archetype: "centered-axial",
  align: "center",
  decor: [],
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
- archetype: the whole composition. Pick ONE (see ARCHETYPES below).
- align: "left" | "center". Flush-left is the Swiss default and usually the stronger choice; centering suits axial/formal work only.
- palette: { bg, accent, text }  — hex colors (#RRGGBB). Pull from the brand. accent is the pop color.
- bgKind: "product" | "uploaded" | "generated" | "gradient" | "color"
- bgImagePrompt: if bgKind="generated", a vivid cinematic photo prompt written as NATURAL PROSE, not keywords: subject, then environment, then lighting, then lens/mood. Calm and uncluttered, with an empty region for type. No text in the image.
- bgImageIndex: 0-based index into the available asset pool (see ASSETS below)
- bgColor / bgColor2: hex colors for gradient/color backgrounds
- layers: 1-4 TEXT elements
- decor: 0-2 relational marks (see DECOR below)
- showcase: how to COMPOSE a real product screenshot into the design, or null (see SHOWCASE below)

ASSETS AVAILABLE:
{{ASSETS_DIRECTIVE}}

ARCHETYPES (each is a complete composition; the renderer supplies the geometry):
- "centered-axial"          — everything on a central axis. Formal, classical, luxury.
- "bottom-strip"            — full-bleed image, type in a strip along the bottom.
- "type-as-image"           — the headline IS the picture. Fills the frame, no photo needed.
- "corner-anchored"         — type locked into one corner, image mass on the diagonal. Swiss tension.
- "big-type-small-caption"  — one huge hero line plus a single small caption. Editorial/fashion.
- "knockout-block"          — type reversed out of a solid accent-colour block.
- "split"                   — hard division; image one side, type-on-colour the other.

TEXT layer: { kind:"text", text, position:("center"|"top"|"bottom"|"upper-third"|"lower-third"), fontFamily, sizePct:(2-22, % of height), color, accent:(true=use palette.accent), uppercase }

SHOWCASE (how a real product screenshot appears — you are SHOWN the screenshots, so LOOK at them):
A screenshot is an ELEMENT in the composition, not wallpaper. Wallpaper (bgKind:"product") stretches
the app behind the type and buries it under a scrim — only use it when the screenshot is genuinely
atmospheric. Otherwise set showcase and let the design hold the product:
- { treatment:"device-frame", imageIndex, position, tilt }  — the screenshot inside a phone body
  (bezel, rounded screen, drop shadow). The default and usually the right answer for an app UI.
- { treatment:"floating-card", imageIndex, position, tilt } — the screenshot as a rounded card with a
  soft shadow. Good for a single panel or a wide UI.
- { treatment:"cropped-detail", imageIndex, position, tilt } — a zoomed crop of ONE telling detail
  (a row, a number, a control). Use when a small part of the UI proves the point better than the whole.
- position: which band the product sits in — the type takes the other bands. tilt: -12..12 degrees.
- Describe what you actually SEE in the screenshot in your choice: a transaction list wants a
  device-frame or a cropped row; a full-bleed hero screen wants a floating-card.
- Set showcase to null when there is no product screenshot worth showing.

DECOR (relational marks — you never give coordinates; each is bound to the type it serves):
- { role:"accent-bar", color, accent }  — the Swiss rule: a short bar set above the kicker.
- { role:"underline",  color, accent }  — a weight under the hero's last line.
- { role:"frame",      color, accent }  — a border inset around the whole composition.

TYPOGRAPHY RULES (hard constraints — a spec that breaks these is rejected):
- EXACTLY ONE hero (sizePct 10-18). Everything else is a kicker or caption (sizePct 3-6).
- hero.sizePct must be AT LEAST 3x the kicker's. A ratio near 1.5x reads as an accident, not a hierarchy.
- Keep the hero to 2-6 words. The renderer fits type to its box, so long copy just comes out small.
- Put the hero and the kicker in DIFFERENT position zones.

DESIGN PRINCIPLES:
- One clear focal point. The eye should land immediately.
- Leave one large area of empty space. Do not fill every region.
- Use REAL assets (product/uploaded) when they exist — authenticity beats generation.
- Use the brand palette consistently; accent is a pop, not a wash.
- Pick the archetype that suits the message, and vary it between variants. Do not default to centered-axial.

- Output ONLY the JSON object. No prose, no markdown fences.`;

// Directive appended when product screenshots are available
function productShotsDirective(count: number): string {
  return `PRODUCT SHOTS: ${count} real screenshot(s) of the ACTUAL product are attached to this message — LOOK AT THEM. They are indexed 0-${count - 1} in the order shown.

To show the product, prefer a SHOWCASE (device-frame / floating-card / cropped-detail) that composes the screenshot INTO the design as an element. Base the treatment on what you actually see in the image.
Only use bgKind:"product" (full-bleed wallpaper behind the type) when the screenshot is atmospheric rather than informational — a UI shown that way gets buried under a legibility scrim and reads as a mistake.`;
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
