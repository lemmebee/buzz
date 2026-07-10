import { jsonrepair } from "jsonrepair";
import type { TextProvider } from "@/lib/providers/types";
import { composeSkillSection } from "@/lib/skills";
import { buildCatalogPrompt, VideoSpec, type VideoSpecT, type LayerT } from "@/remotion/spec";

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
    align: "center",
    decor: [],
    showcase: null,
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
    caption: { show: false, position: "lower-third", fontFamily: "Space Grotesk" },
    scenes,
  });
}

export interface AuthorInput {
  productName: string;
  profile: unknown; // brand profile JSON
  strategy: unknown; // marketing strategy JSON
  vibe: string; // free-text creative direction
  aspectRatio: string;
  durationSec: number;
  script?: string; // optional pre-written narration to design the video around
  imagesAvailable: boolean; // false when ALL image providers are out → design text-only
  productShots: number; // count of real product screenshots available (bgKind:"product")
  // The ACTUAL screenshots, so the director can SEE them and choose a showcase
  // treatment from what's in each — not just be told a count.
  assetImages?: string[];
}

export interface AuthorResult {
  spec: VideoSpecT | null;
  raw: string;
  error?: string;
}

const FPS = 30;

function buildUserPrompt(input: AuthorInput, angleHint?: string): string {
  const totalFrames = Math.round(input.durationSec * FPS);
  const scriptDirective = input.script
    ? `\n\nUSE THIS EXACT VOICEOVER SCRIPT (set spec.script to it verbatim and design the scenes to match it beat-by-beat):\n"${input.script}"`
    : "";
  const angle = angleHint ? `\n\nCREATIVE ANGLE FOR THIS VARIANT: ${angleHint}` : "";
  return `Design a ${input.durationSec}-second ${input.aspectRatio} vertical video for "${input.productName}".

VIBE / CREATIVE DIRECTION: ${input.vibe}

BRAND PROFILE:
${JSON.stringify(input.profile)}

MARKETING STRATEGY:
${JSON.stringify(input.strategy)}

Set aspectRatio="${input.aspectRatio}", fps=${FPS}. The scene durations should total about ${totalFrames} frames.${scriptDirective}${angle}

Output ONLY the JSON object — no prose, no markdown fences.`;
}

// Extract a JSON object from free-form model text. Unlike Gemini's JSON mode,
// a generic text provider may wrap the spec in ```json fences or add prose, so
// strip fences and clamp to the outermost {...}.
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

// Force the requested geometry, pin the narration, and (when no image provider
// is available) downgrade any image background to a brand gradient so a
// text-only run never references a still it can't generate. Then guarantee
// typography (hero per scene, captions off).
function finalizeSpec(data: VideoSpecT, input: AuthorInput): VideoSpecT {
  const aspectRatio = (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
    ? input.aspectRatio
    : "9:16") as VideoSpecT["aspectRatio"];
  const downgraded = input.imagesAvailable
    ? data.scenes
    : data.scenes.map((s) =>
        s.bgKind === "image" ? { ...s, bgKind: "gradient" as const, bgImagePrompt: "" } : s
      );
  // On product (real-screenshot) scenes the APP is the hero, so shrink any text
  // to a small supporting label pinned low — a giant headline would bury the
  // screenshot the whole point of the scene is to show.
  const scenes = downgraded.map((s) =>
    s.bgKind !== "product"
      ? s
      : {
          ...s,
          layers: s.layers.map((l) =>
            l.kind === "text"
              ? { ...l, sizePct: Math.min(l.sizePct, 6), position: "lower-third" as const, uppercase: true }
              : l
          ),
        }
  );
  return guaranteeTypography({
    ...data,
    aspectRatio,
    script: input.script?.trim() ? input.script.trim() : data.script,
    scenes,
  });
}

// One authoring call through ANY text provider (the user's selected creative
// director — never hardcoded), with a single self-repair retry: if the output
// isn't valid JSON or fails the schema, feed the error back and ask for a fix.
async function authorOnce(provider: TextProvider, input: AuthorInput, angleHint?: string): Promise<AuthorResult> {
  // The creative-director + ad-creative knowledge packs raise idea quality and
  // craft for ANY provider (injected into the system prompt, nothing installed).
  const systemPrompt =
    buildCatalogPrompt({ imagesAvailable: input.imagesAvailable, productShots: input.productShots }) +
    composeSkillSection("video-direction");
  const baseUser = buildUserPrompt(input, angleHint);
  let lastError = "";
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYOUR PREVIOUS OUTPUT WAS REJECTED: ${lastError}\nReturn the corrected JSON object only.`;
    try {
      const res = await provider.generate({ systemPrompt, userPrompt, images: input.assetImages });
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
    const result = VideoSpec.safeParse(parsed.value);
    if (!result.success) {
      lastError = `schema validation failed: ${result.error.message.slice(0, 200)}`;
      continue;
    }
    return { spec: finalizeSpec(result.data, input), raw };
  }
  return { spec: null, raw, error: lastError };
}

// Distinct creative angles so best-of-N variants actually diverge — text-only
// providers have no temperature knob, so diversity comes from the brief.
const ANGLES = [
  "PAIN angle: open on the felt frustration the audience lives with, in their own words, then resolve it with a pattern-interrupt hook.",
  "OUTCOME angle: paint the after-state. Show the transformation and make the value undeniable.",
  "CONTRARIAN angle: challenge a belief the category treats as settled, then flip it.",
  "IDENTITY angle: speak to who the viewer becomes and who this is plainly for. Make them see themselves.",
];

interface SceneSummary { i: number; bg: string; hero: string; kicker: string }
function summarizeForJudge(spec: VideoSpecT): { scenes: number; palette: VideoSpecT["palette"]; beats: SceneSummary[] } {
  const beats = spec.scenes.map((s, i) => {
    const texts = s.layers.filter((l) => l.kind === "text" && l.text.trim());
    const hero = texts.find((l) => l.sizePct >= 8)?.text ?? texts[0]?.text ?? "";
    const kicker = texts.find((l) => l.sizePct < 8)?.text ?? "";
    return { i, bg: s.bgKind, hero, kicker };
  });
  return { scenes: spec.scenes.length, palette: spec.palette, beats };
}

// Deterministic tie-breaker / judge fallback: rewards good pacing, one-hero
// scenes, punchy hero lines, and background variety.
function heuristicBestIndex(specs: VideoSpecT[]): number {
  const score = (spec: VideoSpecT): number => {
    let s = 0;
    const n = spec.scenes.length;
    if (n >= 3 && n <= 6) s += 2;
    for (const scene of spec.scenes) {
      const texts = scene.layers.filter((l) => l.kind === "text" && l.text.trim());
      const heroes = texts.filter((l) => l.sizePct >= 8);
      if (heroes.length === 1) s += 1;
      if (heroes.some((h) => h.text.trim().split(/\s+/).length <= 5)) s += 0.5;
    }
    s += new Set(spec.scenes.map((sc) => sc.bgKind)).size * 0.5;
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

// The judge: the SAME creative director picks the strongest candidate. Falls
// back to a deterministic heuristic if the judge call fails or returns junk.
async function judgeSpecs(provider: TextProvider, input: AuthorInput, specs: VideoSpecT[]): Promise<number> {
  const candidates = specs.map((s, i) => ({ index: i, ...summarizeForJudge(s) }));
  const systemPrompt =
    "You are a ruthless creative director reviewing candidate short-video designs. Pick the ONE that would perform best as a social ad. Apply the evaluation rubric in the expert knowledge below (idea/originality, relevance/clarity, craft/execution); when candidates tie on clarity, the braver idea wins. Respond with ONLY a JSON object: {\"winner\": <index>, \"reason\": \"<one line>\"}." +
    composeSkillSection("video-judge");
  const userPrompt = `Product: ${input.productName}\nVibe: ${input.vibe}\nScript: ${input.script ?? ""}\n\nCANDIDATES (JSON):\n${JSON.stringify(candidates)}\n\nReturn the winning index as JSON.`;
  try {
    const res = await provider.generate({ systemPrompt, userPrompt });
    const parsed = parseToObject(res.text);
    if (!("error" in parsed) && parsed.value && typeof parsed.value === "object") {
      const w = (parsed.value as { winner?: unknown }).winner;
      if (typeof w === "number" && w >= 0 && w < specs.length) {
        console.log(`[spec] judge picked variant ${w} of ${specs.length}`);
        return w;
      }
    }
  } catch (err) {
    console.warn(`[spec] judge failed, using heuristic: ${err instanceof Error ? err.message : err}`);
  }
  return heuristicBestIndex(specs);
}

// Author N distinct variants without picking a winner. Used by the pixel-judging
// path (select.ts), which renders cheap previews and judges the frames instead
// of a JSON summary of each spec.
export async function authorVideoVariants(
  provider: TextProvider,
  input: AuthorInput,
  n: number
): Promise<VideoSpecT[]> {
  const count = Math.max(1, Math.min(n, ANGLES.length));
  const variants = await Promise.all(
    Array.from({ length: count }, (_, i) => authorOnce(provider, input, ANGLES[i]))
  );
  return variants.map((v) => v.spec).filter((s): s is VideoSpecT => s !== null);
}

export interface AuthorBestInput extends AuthorInput {
  provider: TextProvider; // the user's selected text provider — the creative director
  n?: number; // how many variants to author (default 3, capped to the angle pool)
  fallbackPalette?: { bg: string; accent: string; text: string }; // brand palette for the deterministic floor
}

export interface AuthorBestResult {
  spec: VideoSpecT;
  source: "judged" | "single" | "deterministic";
  valid: number;
}

// Best-of-N + judge with a deterministic floor. The user's selected text
// provider is the creative director (NO provider is hardcoded): author N diverse
// variants in parallel, keep the valid ones, let the same director judge the
// winner, and if NOTHING valid survives, fall back to a deterministic typography
// spec so a creative run is NEVER lost.
export async function authorBestSpec(input: AuthorBestInput): Promise<AuthorBestResult> {
  const n = Math.max(1, Math.min(input.n ?? 3, ANGLES.length));
  const variants = await Promise.all(
    Array.from({ length: n }, (_, i) => authorOnce(input.provider, input, ANGLES[i]))
  );
  const valid = variants.map((v) => v.spec).filter((s): s is VideoSpecT => s !== null);
  console.log(`[spec] best-of-${n} via ${input.provider.name}: ${valid.length} valid variant(s)`);

  if (valid.length === 0) {
    return {
      spec: buildFallbackSpec({
        script: input.script?.trim() || input.productName,
        palette: input.fallbackPalette ?? { bg: "#0b0b0f", accent: "#ffd60a", text: "#ffffff" },
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec,
      }),
      source: "deterministic",
      valid: 0,
    };
  }
  if (valid.length === 1) return { spec: valid[0], source: "single", valid: 1 };

  const winner = await judgeSpecs(input.provider, input, valid);
  return { spec: valid[winner], source: "judged", valid: valid.length };
}
