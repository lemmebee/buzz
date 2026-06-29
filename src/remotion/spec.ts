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
export const FONTS = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Bebas Neue",
  "Anton",
  "Archivo Black",
  "Playfair Display",
  "Roboto",
] as const;

const Font = z.enum(FONTS).catch("Inter");
const TextAnim = z.enum(["fadeUp", "pop", "typewriter", "slideLeft", "none"]).catch("fadeUp");
const Position = z.enum(["center", "top", "bottom", "upper-third", "lower-third"]).catch("center");
const Shape = z.enum(["rect", "circle", "ellipse", "triangle"]).catch("rect");
const Transition = z.enum(["fade", "slide", "wipe", "clockWipe", "flip", "none"]).catch("fade");
const KenBurns = z.enum(["in", "out", "none"]).catch("in");

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
    fontFamily: "Inter",
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
    bgKind: z.enum(["image", "color", "gradient"]).catch("image"),
    bgImagePrompt: z.string().catch(""), // buzz generates the still from this
    bgColor: Hex,
    bgColor2: Hex, // second stop for gradient backgrounds
    kenBurns: KenBurns,
    transition: Transition, // transition INTO this scene
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
  .catch({ show: true, position: "lower-third", fontFamily: "Inter" });

export const VideoSpec = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9", "4:5"]).catch("9:16"),
  fps: z.number().min(24).max(30).catch(30),
  palette: Palette,
  // The voiceover narration. Drives TTS + whisper captions. The LLM writes it.
  script: z.string().catch(""),
  caption: Caption,
  scenes: z.array(Scene).min(1).max(8).catch([]),
});

export type VideoSpecT = z.infer<typeof VideoSpec>;
export type LayerT = z.infer<typeof Layer>;
export type SceneT = z.infer<typeof Scene>;

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
export const CATALOG_PROMPT = `You are the CREATIVE DIRECTOR of a short vertical social video. Output ONE JSON object matching this spec. You design the whole video: pacing, scenes, motion, text, color. Be bold and on-brand — this is not a template.

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
- layers: 0-5 elements drawn on top:
  - TEXT layer: { kind:"text", text, position:("center"|"top"|"bottom"|"upper-third"|"lower-third"), animation:("fadeUp"|"pop"|"typewriter"|"slideLeft"|"none"), fontFamily, sizePct:(2-18, % of height; hero text ~9-14), color, accent:(true=use palette.accent), uppercase }
  - SHAPE layer: { kind:"shape", shape:("rect"|"circle"|"ellipse"|"triangle"), color, xPct,yPct (center, 0-100), widthPct,heightPct, opacity } — for accent bars, badges, backing cards behind text

FONTS allowed: ${FONTS.join(", ")}.

RULES:
- Use the brand palette consistently. Put hero text in big sizePct with accent or strong contrast over a backing shape for legibility.
- Vary scenes: different backgrounds, different layouts/animations. Make it feel designed.
- Output ONLY the JSON object. No prose, no markdown fences.`;
