import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ImageProvider, ImageGenerationInput, ImageGenerationOutput } from "./types";

const BASE_URL = "https://gen.pollinations.ai/image";

export function createPollinationsImageProvider(): ImageProvider {
  return {
    name: "pollinations/flux",

    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const prompt = encodeURIComponent(input.prompt);
      const width = input.width || 1024;
      const height = input.height || 1024;
      const apiKey = process.env.POLLINATIONS_API_KEY;

      const params = new URLSearchParams({
        width: String(width),
        height: String(height),
        model: "flux",
        nologo: "true",
        seed: String(Math.floor(Math.random() * 1000000)),
      });

      const url = `${BASE_URL}/${prompt}?${params}`;

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`Pollinations API error: ${response.status}`);
      }

      // Save image locally since re-fetching the URL requires auth
      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });
      const filename = `pollinations-${Date.now()}.jpg`;
      const localPath = join(mediaDir, filename);
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(localPath, buffer);

      return { url, localPath: `/media/${filename}` };
    },
  };
}
