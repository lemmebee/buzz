import type { TextProvider, TextGenerationInput, TextGenerationOutput, ProviderConfig } from "./types";

type HuggingFaceContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface HuggingFaceMessage {
  role: "system" | "user" | "assistant";
  content: string | HuggingFaceContentPart[];
}

interface HuggingFaceRequest {
  model: string;
  messages: HuggingFaceMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface HuggingFaceResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_MODEL = "zai-org/GLM-4.5V";
const DEFAULT_BASE_URL = "https://router.huggingface.co/v1";

export function createHuggingFaceTextProvider(config: ProviderConfig = {}): TextProvider {
  const apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY || "";
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const model = config.model || DEFAULT_MODEL;

  return {
    name: `huggingface/${model}`,

    async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
      const userContent: string | HuggingFaceContentPart[] =
        input.images && input.images.length > 0
          ? [
              { type: "text" as const, text: input.userPrompt },
              ...input.images.map((img) => ({
                type: "image_url" as const,
                image_url: { url: img.startsWith("data:") ? img : `data:image/png;base64,${img}` },
              })),
            ]
          : input.userPrompt;

      const messages: HuggingFaceMessage[] = [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: userContent },
      ];

      const requestBody: HuggingFaceRequest = {
        model,
        messages,
        max_tokens: input.maxTokens || 2048,
        temperature: input.temperature ?? 0.7,
        stream: false,
      };

      const url = `${baseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HuggingFace API error: ${response.status} - ${errorText}`);
      }

      const data: HuggingFaceResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from HuggingFace API");
      }

      return {
        text: data.choices[0].message.content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}
