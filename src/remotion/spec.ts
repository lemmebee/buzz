import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// The LLM-authored video spec. ONE Zod schema is the single source of truth:
//   • CATALOG_PROMPT (below) describes it to the LLM (the "creative director")
//   • VideoSpec.safeParse() is the render-vs-fallback gate
//   • every field auto-heals via .catch()/.default()/clamp, so an imperfect but
//     renderable spec is repaired rather than rejected. Only a structurally
//     broken spec fails safeParse and falls back to the fixed composition.
// Closed enums = the guardrail: the LLM can only pick values the renderer can
// actually draw, so a validated spec is always renderable.
// ────────────────────────────────────────────────────────────────────────────

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .catch("#ffffff");

// Curated, headless-safe font allow-list (loaded via @remotion/google-fonts).
// Deliberately excludes the LLM-monoculture defaults (Inter/Roboto/Poppins/
// Playfair) — those read as AI slop. Condensed grotesques for display, a
// distinctive grotesque for body, one mono and one serif for pairing.
export const FONTS = [
  "Space Grotesk", // distinctive grotesque — the default
  "Chivo",
  "Archivo",
  "Montserrat",
  "Oswald", // condensed
  "Bebas Neue", // ultra-condensed display
  "Anton", // heavy condensed display
  "Archivo Black", // heavy display
  "Space Mono", // mono — pair with a sans
  "Fraunces", // expressive serif — pair with a sans
] as const;

const Font = z.enum(FONTS).catch("Space Grotesk");
const TextAnim = z.enum(["fadeUp", "pop", "typewriter", "slideLeft", "none"]).catch("fadeUp");
const Position = z.enum(["center", "top", "bottom", "upper-third", "lower-third"]).catch("center");
const Shape = z.enum(["rect", "circle", "ellipse", "triangle"]).catch("rect");
const Transition = z.enum(["fade", "slide", "wipe", "clockWipe", "flip", "none"]).catch("fade");
const KenBurns = z.enum(["in", "out", "none"]).catch("in");

// Relational decor: a mark bound to the text it serves, never free-floating
// coordinates. Same vocabulary as the image engine — this is what turns a
// stray rectangle into an intentional accent.
export const DECOR_ROLES = ["accent-bar", "underline", "frame"] as const;
const Decor = z
  .object({
    role: z.enum(DECOR_ROLES).catch("accent-bar"),
    color: Hex,
    accent: z.boolean().catch(true),
  })
  .catch({ role: "accent-bar", color: "#ffffff", accent: true });

// Product showcase — a real screenshot COMPOSED INTO a scene as an element
// (phone frame / floating card / cropped detail), not stretched behind the type.
// Same vocabulary as the image engine.
export const SHOWCASE_TREATMENTS = ["device-frame", "floating-card", "cropped-detail"] as const;
const Showcase = z.object({
  treatment: z.enum(SHOWCASE_TREATMENTS).catch("device-frame"),
  imageIndex: z.number().min(0).catch(0),
  position: Position,
  tilt: z.number().min(-12).max(12).catch(0),
});

// One permissive layer object (kind discriminator + every field defaulted) so a
// layer NEVER fails to parse — the renderer reads only the fields for its kind.
export const Layer = z
  .object({
    kind: z.enum(["text", "shape"]).catch("text"),
    // text fields
    text: z.string().catch(""),
    position: Position,
    animation: TextAnim,
    fontFamily: Font,
    sizePct: z.number().min(2).max(18).catch(7), // font size as % of video height
    color: Hex,
    accent: z.boolean().catch(false), // use palette.accent instead of color
    uppercase: z.boolean().catch(false),
    // shape fields
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
    fontFamily: "Space Grotesk",
    sizePct: 7,
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

export const Scene = z
  .object({
    durationInFrames: z.number().min(15).max(450).catch(90),
    bgKind: z.enum(["image", "color", "gradient", "product"]).catch("image"), // "product" = a REAL product screenshot
    bgImagePrompt: z.string().catch(""), // buzz generates the still from this
    bgColor: Hex,
    bgColor2: Hex, // second stop for gradient backgrounds
    kenBurns: KenBurns,
    transition: Transition, // transition INTO this scene
    align: z.enum(["left", "center"]).catch("center"),
    decor: z.array(Decor).max(2).catch([]),
    showcase: Showcase.nullable().catch(null),
    layers: z.array(Layer).max(6).catch([]),
  })
  .catch({
    durationInFrames: 90,
    bgKind: "color",
    bgImagePrompt: "",
    bgColor: "#0b0b0f",
    bgColor2: "#1b1b2f",
    kenBurns: "in",
    transition: "fade",
    align: "center",
    decor: [],
    showcase: null,
    layers: [],
  });

export const Palette = z
  .object({ bg: Hex, accent: Hex, text: Hex })
  .catch({ bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" });

export const Caption = z
  .object({
    show: z.boolean().catch(true),
    position: Position,
    fontFamily: Font,
  })
  .catch({ show: true, position: "lower-third", fontFamily: "Space Grotesk" });

export const VideoSpec = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9", "4:5"]).catch("9:16"),
  fps: z.number().min(24).max(30).catch(30),
  palette: Palette,
  // The voiceover narration. Drives TTS + whisper captions. The LLM writes it.
  script: z.string().catch(""),
  caption: Caption,
  // NO .catch() here, unlike every other field: an empty/missing/malformed
  // scenes array MUST fail safeParse so the caller falls back to the fixed
  // composition. Healing it to [] would yield a valid-looking spec that renders
  // a single 1-frame "video". Individual bad scenes still self-heal (Scene.catch).
  scenes: z.array(Scene).min(1).max(8),
});

export type VideoSpecT = z.infer<typeof VideoSpec>;
export type LayerT = z.infer<typeof Layer>;
export type SceneT = z.infer<typeof Scene>;
export type DecorT = z.infer<typeof Decor>;

// ─── Render-time props (what the SpecVideo composition consumes) ──────────────
// Differs from the authored spec: each scene's bgImagePrompt has been resolved
// to a real staticFile-relative image src, and audio/captions are attached.
export interface ResolvedScene {
  durationInFrames: number;
  bgKind: "image" | "color" | "gradient";
  bgImageSrc?: string; // staticFile-relative, e.g. "media/x.jpg"
  bgColor: string;
  bgColor2: string;
  kenBurns: "in" | "out" | "none";
  transition: "fade" | "slide" | "wipe" | "clockWipe" | "flip" | "none";
  align: "left" | "center";
  decor: DecorT[];
  showcase?: import("./image-spec").ResolvedShowcase;
  layers: LayerT[];
}

// MUST be a `type` (not interface) so it's assignable to Record<string,unknown>
// — Remotion's <Composition>/selectComposition constrain props to that.
export type SpecVideoProps = {
  scenes: ResolvedScene[];
  audioSrc: string; // staticFile-relative
  captions: { text: string; startMs: number; endMs: number }[];
  caption: { show: boolean; position: z.infer<typeof Position>; fontFamily: string };
  palette: { bg: string; accent: string; text: string };
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

// Overlap each transition consumes between adjacent scenes. The renderer and
// the duration math (render-spec.ts) must use the SAME value.
export const TRANSITION_FRAMES = 14;

export const SPEC_COMPOSITION_ID = "SpecVideo";

export const DEFAULT_SPEC_PROPS: SpecVideoProps = {
  scenes: [],
  audioSrc: "",
  captions: [],
  caption: { show: false, position: "lower-third", fontFamily: "Inter" },
  palette: { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" },
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 90,
};

// Auto-generated knowledge pack injected into the LLM prompt — the "catalog"
// the creative director may use. Kept in lockstep with the schema above.
export const CATALOG_PROMPT = `You are the CREATIVE DIRECTOR of a short vertical social video — a TYPOGRAPHY-LED marketing motion-graphics ad, NOT a captioned slideshow. Output ONE JSON object matching this spec. You design the whole video: pacing, scenes, motion, text, color. Be bold and on-brand — this is not a template.

THE WORDS ARE THE ART. Every scene puts bold, punchy, product-relevant typography on screen as designed layers (hero lines, kickers, an accent word, a CTA). Do NOT rely on voiceover captions — set caption.show=false. A scene with no text layer is a failure.

TOP-LEVEL:
- aspectRatio: "9:16" | "1:1" | "16:9" | "4:5"  (default "9:16")
- fps: 24-30  (use 30)
- palette: { bg, accent, text }  — hex colors (#RRGGBB). Pull from the brand. accent is the pop color.
- script: the spoken VOICEOVER narration (what the viewer HEARS). Punchy, quotable, paced for the total video length. No emojis/hashtags.
- caption: { show: true|false, position, fontFamily } — auto-captions burned from the voiceover.
- scenes: 2-6 ordered scenes that tell a story beat-by-beat.

EACH SCENE:
- durationInFrames: at 30fps, 30=1s. Scenes total should match the script length (~${30 * 1}f per spoken sentence).
- bgKind: "image" (AI-generated still) | "color" (solid) | "gradient" (bgColor→bgColor2)
- bgImagePrompt: if bgKind="image", a vivid cinematic photo prompt for the background. Calm/uncluttered with room for text. No on-screen text in the image.
- bgColor / bgColor2: hex
- kenBurns: "in" | "out" | "none"  (slow zoom on image backgrounds)
- transition: how this scene enters — "fade" | "slide" | "wipe" | "clockWipe" | "flip" | "none"
- align: "left" | "center" — text alignment for the scene. Flush-left reads as designed; centering suits formal/axial beats.
- decor: 0-2 relational marks. You NEVER give coordinates; each is bound to the type it serves and the renderer places it:
  - { role:"accent-bar", color, accent } — the Swiss rule, a short bar set above the kicker
  - { role:"underline", color, accent } — a weight under the hero's last line
  - { role:"frame", color, accent } — a thin border inset around the whole scene
- showcase: how to COMPOSE a real product screenshot into THIS scene, or null. A screenshot is an ELEMENT, not wallpaper — do NOT bury it behind the type with bgKind:"product". When you have product shots (see below), a "here's the app" scene should set showcase:
  - { treatment:"device-frame", imageIndex, position, tilt(-12..12) } — the screenshot inside a phone body. Default for an app UI.
  - { treatment:"floating-card", imageIndex, position, tilt } — the screenshot as a rounded card. Good for one panel.
  - { treatment:"cropped-detail", imageIndex, position, tilt } — a zoomed slice of ONE telling row/number.
  The showcase takes its band; put the scene's text in the other bands.
- layers: 1-4 TEXT layers drawn on top. EVERY scene MUST include at least one bold TEXT layer — typography is the art.
  - TEXT layer: { kind:"text", text, position:("center"|"top"|"bottom"|"upper-third"|"lower-third"), animation:("fadeUp"|"pop"|"typewriter"|"slideLeft"|"none"), fontFamily, sizePct:(2-18, % of height; hero text ~9-14), color, accent:(true=use palette.accent), uppercase }

FONTS allowed: ${FONTS.join(", ")}.
FONT PAIRING: when a scene has a hero AND a kicker, cross the boundary — a condensed display face (Anton/Bebas Neue/Archivo Black/Oswald) for the hero paired with a grotesque, mono, or serif (Space Grotesk/Chivo/Space Mono/Fraunces) for the kicker. NEVER pair two similar sans-serifs; that reads as an accident.

LAYOUT RULES (critical — keep it clean):
- AT MOST ONE hero text per scene (sizePct 9-14). Any additional text in the same scene must be a small kicker/label (sizePct 3-5) placed in a DIFFERENT zone. NEVER stack two large texts — they overlap.
- Use the position zones to separate elements: a scene's hero goes in ONE of center / upper-third / lower-third; a kicker goes in a different zone (e.g. hero center + kicker top).
- Keep hero lines SHORT (2-5 words). Long sentences belong in the voiceover/captions, not as hero text.
- EMPHASIS: wrap the ONE most important word of a hero line in *asterisks* (e.g. "Logged in *seconds*"). That word gets the accent colour and a scale-pop. Exactly one word per line.
- caption.show: ALWAYS set FALSE. This style shows its own designed typography on every scene; raw voiceover captions are off-brand here.

MOTION-DESIGN PRINCIPLES:
- Timing is in FRAMES (30fps → 30 frames = 1 second). Give each scene enough time to read its text (~0.4s per word, minimum ~45 frames).
- Establish a clear visual hierarchy: one focal element per scene. Use size + the accent color + contrast (light text on dark/dimmed bg, or a backing shape) for legibility.
- Use the brand palette consistently across scenes so it feels like one piece.
- Vary scene to scene: alternate image / gradient / color backgrounds and animations so it feels designed, not repetitive. Open with a hook, end with the CTA.
- Respect safe margins — never push text to the very edge.

- Output ONLY the JSON object. No prose, no markdown fences.`;

// Appended when NO image provider is available this run (all out of credits).
// GENERATED stills are off, but real product screenshots (bgKind:"product") and
// gradients/colors still work — so the director designs a cohesive piece from
// those instead of an image video whose every scene degrades to flat color.
const NO_IMAGES_DIRECTIVE = `

⚠ GENERATED IMAGE BACKGROUNDS ARE UNAVAILABLE THIS RUN. Do NOT use bgKind "image" (it will fail). Use "gradient" or "color" backgrounds, plus bgKind "product" for any real product screenshots offered below. Lean into bold typography, the brand palette, rich gradients, and backing shapes (rect/circle/ellipse). Make it a premium kinetic-typography piece — confident and varied, not a slideshow waiting for photos.`;

// Appended when the product has real screenshots. Steers the director to show
// the ACTUAL app via bgKind:"product" rather than describing a UI in a
// bgImagePrompt — text-to-image can't render the real app and fakes a wrong one.
function productShotsDirective(count: number): string {
  return `

PRODUCT SHOTS: there are ${count} real screenshots of the ACTUAL product UI available. To show the app/product on screen, set a scene's bgKind to "product" (leave bgImagePrompt empty) — this uses a REAL screenshot. Use it for the "here's how it works" / proof moments. NEVER describe the app, its screen, or its UI in a bgImagePrompt — image generation will invent a WRONG, fake-looking app. Keep any text overlay on product scenes short so the screenshot stays visible.`;
}

// Capability-aware system prompt for the creative director. imagesAvailable and
// productShots come from the orchestrator's pre-flight so the LLM only designs
// with backgrounds we can actually render.
export function buildCatalogPrompt(opts: { imagesAvailable: boolean; productShots?: number }): string {
  let prompt = opts.imagesAvailable ? CATALOG_PROMPT : CATALOG_PROMPT + NO_IMAGES_DIRECTIVE;
  if (opts.productShots && opts.productShots > 0) prompt += productShotsDirective(opts.productShots);
  return prompt;
}
