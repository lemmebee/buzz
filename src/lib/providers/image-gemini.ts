import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ImageProvider, ImageGenerationInput, ImageGenerationOutput } from "./types";

const MODEL = "gemini-2.5-flash-image";

export function createGeminiImageProvider(config: { apiKey: string }): ImageProvider {
  const ai = new GoogleGenerativeAI(config.apiKey);

  return {
    name: `gemini-image/${MODEL}`,

    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const model = ai.getGenerativeModel({ model: MODEL });

      let prompt = input.prompt;
      if (input.width && input.height) {
        const ratio = input.width / input.height;
        if (ratio > 1.3) prompt += " (landscape orientation)";
        else if (ratio < 0.77) prompt += " (portrait orientation)";
        else prompt += " (square orientation)";
      }

      const generationConfig = {
        responseModalities: ["Image"],
      } as unknown as GenerationConfig;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = result.response;
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => (p as { inlineData?: unknown }).inlineData);

      if (!imagePart?.inlineData) {
        throw new Error("Gemini image generation returned no image data");
      }

      const { mimeType, data } = imagePart.inlineData as { mimeType: string; data: string };
      const buffer = Buffer.from(data, "base64");

      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const filename = `gemini-${Date.now()}.${ext}`;
      const localPath = join(mediaDir, filename);
      writeFileSync(localPath, buffer);

      return { url: `/api/media/${filename}`, localPath: `/api/media/${filename}` };
    },
  };
}
