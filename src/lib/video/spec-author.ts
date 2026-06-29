import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { CATALOG_PROMPT, VideoSpec, type VideoSpecT, type LayerT } from "@/remotion/spec";

// Bold display faces that read as marketing typography, not body text.
const DISPLAY_FONTS = ["Anton", "Bebas Neue", "Archivo Black", "Montserrat", "Oswald"] as const;
const HERO_POSITIONS = ["center", "upper-third", "lower-third"] as const;
const HERO_ANIMS = ["pop", "fadeUp", "slideLeft"] as const;

// Break the narration into short, punchy hero phrases — one per scene that needs
// one. Splits on sentence/clause boundaries, then clamps each to ~5 words so it
// reads as a headline, not a paragraph.
function punchyPhrases(script: string, n: number): string[] {
  const flat = script.replace(/\s+/g, " ").trim();
  const parts = flat
    .split(/(?<=[.!?,;:])\s+|\s+[–—-]\s+/)
    .map((s) => s.replace(/^[\s.,;:!?–—-]+|[\s.,;:]+$/g, "").trim())
    .filter(Boolean);
  const pool = parts.length ? parts : flat ? [flat] : [];
  const phrases: string[] = [];
  for (let i = 0; i < n; i++) {
    const src = pool.length ? pool[i % pool.length] : "";
    phrases.push(src.split(" ").slice(0, 5).join(" "));
  }
  return phrases;
}

// Typography GUARANTEE. This style is a typography-led ad, so every scene must
// carry bold on-screen words and the video must never fall back to voiceover
// captions. If the model omitted text on a scene, inject a hero line built from
// the narration; always pin caption.show=false.
function guaranteeTypography(spec: VideoSpecT): VideoSpecT {
  const phrases = punchyPhrases(spec.script, spec.scenes.length);
  const scenes = spec.scenes.map((scene, i) => {
    const hasText = scene.layers.some((l) => l.kind === "text" && l.text.trim().length > 0);
    const phrase = phrases[i]?.trim();
    if (hasText || !phrase) return scene;
    const hero: LayerT = {
      kind: "text",
      text: phrase,
      position: HERO_POSITIONS[i % HERO_POSITIONS.length],
      animation: HERO_ANIMS[i % HERO_ANIMS.length],
      fontFamily: DISPLAY_FONTS[i % DISPLAY_FONTS.length],
      sizePct: 11,
      color: spec.palette.text,
      accent: i % 2 === 1, // alternate accent color so the type has rhythm
      uppercase: true,
      // shape fields are unused for a text layer but required by the layer shape
      shape: "rect",
      xPct: 50,
      yPct: 50,
      widthPct: 40,
      heightPct: 20,
      opacity: 1,
    };
    return { ...scene, layers: [...scene.layers, hero] };
  });
  return { ...spec, scenes, caption: { ...spec.caption, show: false } };
}

// Deterministic typography spec, built WITHOUT the LLM. Used when authoring is
// unavailable (no API key) or fails — so "creative" always renders a real
// typography video instead of silently degrading to a captionless slideshow.
// Brand-colored gradient/solid backgrounds (no image generation needed) with a
// bold hero line per scene drawn straight from the narration.
const FALLBACK_TRANSITIONS = ["fade", "slide", "wipe", "clockWipe", "flip"] as const;

export function buildFallbackSpec(input: {
  script: string;
  palette: { bg: string; accent: string; text: string };
  aspectRatio: string;
  durationSec: number;
}): VideoSpecT {
  const fps = 30;
  const sceneCount = Math.max(2, Math.min(5, Math.round(input.durationSec / 4)));
  const per = Math.max(15, Math.round((input.durationSec * fps) / sceneCount));
  const phrases = punchyPhrases(input.script, sceneCount);
  const fallbackWords = input.script.trim().split(/\s+/).slice(0, 5).join(" ");

  const scenes: VideoSpecT["scenes"] = phrases.map((phrase, i) => ({
    durationInFrames: per,
    bgKind: i % 2 === 0 ? "gradient" : "color",
    bgImagePrompt: "",
    bgColor: input.palette.bg,
    bgColor2: input.palette.accent,
    kenBurns: "none",
    transition: i === 0 ? "none" : FALLBACK_TRANSITIONS[i % FALLBACK_TRANSITIONS.length],
    layers: [
      {
        kind: "text",
        text: phrase || fallbackWords,
        position: HERO_POSITIONS[i % HERO_POSITIONS.length],
        animation: HERO_ANIMS[i % HERO_ANIMS.length],
        fontFamily: DISPLAY_FONTS[i % DISPLAY_FONTS.length],
        sizePct: 12,
        // On a brand-colored background, keep hero type on the readable text
        // color (not accent, which may match the gradient).
        color: input.palette.text,
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
  }));

  const aspectRatio = (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
    ? input.aspectRatio
    : "9:16") as VideoSpecT["aspectRatio"];

  return guaranteeTypography({
    aspectRatio,
    fps,
    palette: input.palette,
    script: input.script.trim(),
    caption: { show: false, position: "lower-third", fontFamily: "Inter" },
    scenes,
  });
}

export interface AuthorInput {
  apiKey: string;
  model?: string;
  productName: string;
  profile: unknown; // brand profile JSON
  strategy: unknown; // marketing strategy JSON
  vibe: string; // free-text creative direction
  aspectRatio: string;
  durationSec: number;
  script?: string; // optional pre-written narration to design the video around
}

export interface AuthorResult {
  spec: VideoSpecT | null;
  raw: string;
  error?: string;
}

// The LLM as creative director: emits a full VideoSpec. Reliability pipeline:
// Gemini JSON mode (responseMimeType:application/json — reliably valid JSON
// without the creativity-flattening that a strict responseSchema causes, since
// the model otherwise just satisfies minItems/required literally) → jsonrepair
// (syntax salvage) → Zod safeParse (auto-heals every field via .catch/.default/
// clamp). spec=null only when even repair+safeParse can't yield a renderable
// spec — the caller then falls back to the fixed composition.
export async function authorVideoSpec(input: AuthorInput): Promise<AuthorResult> {
  const ai = new GoogleGenerativeAI(input.apiKey);
  const modelName = input.model || "gemini-2.5-flash";

  const fps = 30;
  const totalFrames = Math.round(input.durationSec * fps);
  const scriptDirective = input.script
    ? `\n\nUSE THIS EXACT VOICEOVER SCRIPT (set spec.script to it verbatim and design the scenes to match it beat-by-beat):\n"${input.script}"`
    : "";

  const userPrompt = `Design a ${input.durationSec}-second ${input.aspectRatio} vertical video for "${input.productName}".

VIBE / CREATIVE DIRECTION: ${input.vibe}

BRAND PROFILE:
${JSON.stringify(input.profile)}

MARKETING STRATEGY:
${JSON.stringify(input.strategy)}

Set aspectRatio="${input.aspectRatio}", fps=${fps}. The scene durations should total about ${totalFrames} frames.${scriptDirective}

Author the full JSON spec now.`;

  const model = ai.getGenerativeModel({
    model: modelName,
    systemInstruction: CATALOG_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.95,
      // Large enough to echo the full voiceover script verbatim AND author
      // 2-6 scenes with detailed image prompts — 4096 truncated multi-scene
      // specs, which jsonrepair salvaged into an empty/short scenes array.
      maxOutputTokens: 8192,
    },
  });

  let raw = "";
  try {
    const result = await model.generateContent(userPrompt);
    raw = result.response.text();
  } catch (err) {
    return { spec: null, raw, error: err instanceof Error ? err.message : String(err) };
  }

  // Parse → repair-on-failure → validate+auto-heal.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(raw));
    } catch (err) {
      return { spec: null, raw, error: `unparseable JSON: ${err instanceof Error ? err.message : err}` };
    }
  }

  const result = VideoSpec.safeParse(parsed);
  if (!result.success) {
    console.warn(`[spec] safeParse failed (raw ${raw.length} chars): ${result.error.message.slice(0, 300)}`);
    return { spec: null, raw, error: `schema validation failed: ${result.error.message.slice(0, 300)}` };
  }
  console.log(`[spec] authored ${result.data.scenes.length} scenes, script ${result.data.script.length} chars (raw ${raw.length} chars)`);

  const spec: VideoSpecT = guaranteeTypography({
    ...result.data,
    // Force the requested geometry; pin the narration to the pre-written script.
    aspectRatio: (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
      ? input.aspectRatio
      : "9:16") as VideoSpecT["aspectRatio"],
    script: input.script?.trim() ? input.script.trim() : result.data.script,
  });
  return { spec, raw };
}
