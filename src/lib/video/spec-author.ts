import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { CATALOG_PROMPT, VideoSpec, type VideoSpecT } from "@/remotion/spec";

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

  const spec: VideoSpecT = {
    ...result.data,
    // Force the requested geometry; pin the narration to the pre-written script.
    aspectRatio: (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
      ? input.aspectRatio
      : "9:16") as VideoSpecT["aspectRatio"],
    script: input.script?.trim() ? input.script.trim() : result.data.script,
  };
  return { spec, raw };
}
