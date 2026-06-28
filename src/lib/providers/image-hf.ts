import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ImageProvider, ImageGenerationInput, ImageGenerationOutput } from "./types";

const HF_API_BASE = "https://api-inference.huggingface.co/models";

export function createHuggingFaceImageProvider(config: {
  apiKey: string;
  model: string;
}): ImageProvider {
  return {
    name: `huggingface/${config.model}`,

    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const url = `${HF_API_BASE}/${config.model}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: input.prompt }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const buffer = Buffer.from(await response.arrayBuffer());

      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });
      const ext = contentType.includes("png") ? "png" : "jpg";
      const filename = `hf-${Date.now()}.${ext}`;
      const localPath = join(mediaDir, filename);
      writeFileSync(localPath, buffer);

      return { url: `/api/media/${filename}`, localPath: `/api/media/${filename}` };
    },
  };
}
