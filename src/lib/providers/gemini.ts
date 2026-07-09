import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { TextProvider, TextGenerationInput, TextGenerationOutput, ProviderConfig } from "./types";
import { toInlineImage } from "./image-input";

const DEFAULT_MODEL = "gemini-2.5-flash";

export function createGeminiTextProvider(config: ProviderConfig = {}): TextProvider {
  const apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY || "";
  const modelName = config.model || DEFAULT_MODEL;
  const ai = new GoogleGenerativeAI(apiKey);

  return {
    name: `gemini/${modelName}`,

    async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
      const model = ai.getGenerativeModel({
        model: modelName,
        systemInstruction: input.systemPrompt,
        generationConfig: {
          maxOutputTokens: input.maxTokens || 2048,
          temperature: input.temperature ?? 0.7,
        },
      });

      const parts: Part[] = [{ text: input.userPrompt }];

      for (const img of input.images ?? []) {
        const inline = toInlineImage(img);
        if (inline) parts.push({ inlineData: inline });
        else console.warn(`[Gemini] could not resolve image: ${img}`);
      }

      console.log(`[TextProvider] sending request to gemini/${modelName}`);
      const result = await model.generateContent(parts);
      const response = result.response;
      const text = response.text();
      const usage = response.usageMetadata;

      return {
        text,
        usage: usage
          ? {
              promptTokens: usage.promptTokenCount ?? 0,
              completionTokens: usage.candidatesTokenCount ?? 0,
              totalTokens: usage.totalTokenCount ?? 0,
            }
          : undefined,
      };
    },
  };
}
