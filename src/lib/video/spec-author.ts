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
}

export interface AuthorResult {
  spec: VideoSpecT | null;
  raw: string;
  error?: string;
}

// The LLM as creative director: emits a full VideoSpec. Reliability pipeline:
// Gemini JSON mode → jsonrepair (syntax salvage) → Zod safeParse (auto-heals
// every field via .catch/.default/clamp). Returns spec=null only when the
// output is so broken even repair+safeParse can't yield a renderable spec —
// the caller then falls back to the fixed composition.
export async function authorVideoSpec(input: AuthorInput): Promise<AuthorResult> {
  const ai = new GoogleGenerativeAI(input.apiKey);
  const model = ai.getGenerativeModel({
    model: input.model || "gemini-2.5-flash",
    systemInstruction: CATALOG_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.95,
      maxOutputTokens: 4096,
    },
  });

  const fps = 30;
  const totalFrames = Math.round(input.durationSec * fps);
  const userPrompt = `Design a ${input.durationSec}-second ${input.aspectRatio} vertical video for "${input.productName}".

VIBE / CREATIVE DIRECTION: ${input.vibe}

BRAND PROFILE:
${JSON.stringify(input.profile)}

MARKETING STRATEGY:
${JSON.stringify(input.strategy)}

Set aspectRatio="${input.aspectRatio}", fps=${fps}. The scene durations should total about ${totalFrames} frames. Author the full JSON spec now.`;

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
    return { spec: null, raw, error: `schema validation failed: ${result.error.message.slice(0, 300)}` };
  }
  // Force the requested geometry (don't let the LLM override the surface).
  const spec: VideoSpecT = {
    ...result.data,
    aspectRatio: (["9:16", "1:1", "16:9", "4:5"].includes(input.aspectRatio)
      ? input.aspectRatio
      : "9:16") as VideoSpecT["aspectRatio"],
  };
  return { spec, raw };
}
