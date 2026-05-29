import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

const BASE_URL = "https://gen.pollinations.ai/image";

export type ImageryTreatment = "none" | "warm" | "duotone";

export interface FetchBackgroundOptions {
  treatment?: ImageryTreatment;
  width?: number;
  height?: number;
}

export interface BackgroundImageResult {
  url: string;
  localPath: string;
}

async function applyTreatment(
  pipeline: sharp.Sharp,
  treatment: ImageryTreatment
): Promise<sharp.Sharp> {
  if (treatment === "warm") {
    // Push toward amber: lift reds, trim blues, gentle saturation.
    return pipeline
      .modulate({ saturation: 1.08, brightness: 1.02 })
      .tint({ r: 255, g: 236, b: 210 });
  }
  if (treatment === "duotone") {
    // Desaturate to luminance, then map shadows->ink, highlights->accent.
    return pipeline
      .grayscale()
      .tint({ r: 80, g: 110, b: 170 })
      .modulate({ brightness: 1.04 });
  }
  return pipeline;
}

export async function fetchBackgroundImage(
  prompt: string,
  opts: FetchBackgroundOptions = {}
): Promise<BackgroundImageResult> {
  const width = opts.width ?? SCENE_W;
  const height = opts.height ?? SCENE_H;
  const treatment = opts.treatment ?? "none";
  const apiKey = process.env.POLLINATIONS_API_KEY;

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: "flux",
    nologo: "true",
    enhance: "true",
    seed: String(Math.floor(Math.random() * 1000000)),
  });
  const url = `${BASE_URL}/${encodeURIComponent(prompt)}?${params}`;

  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Pollinations API error: ${response.status}`);
  }

  const srcBuffer = Buffer.from(await response.arrayBuffer());

  let pipeline = sharp(srcBuffer).resize(width, height, {
    fit: "cover",
    position: "attention",
  });
  pipeline = await applyTreatment(pipeline, treatment);
  const outBuffer = await pipeline.jpeg({ quality: 88 }).toBuffer();

  const mediaDir = join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });
  const filename = `bg-${Date.now()}.jpg`;
  writeFileSync(join(mediaDir, filename), outBuffer);

  const apiPath = `/api/media/${filename}`;
  return { url: apiPath, localPath: apiPath };
}
