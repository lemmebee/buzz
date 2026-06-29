import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  return row?.value ?? null;
}

export async function getTextProvider(): Promise<string> {
  return (
    (await getSetting("TEXT_PROVIDER")) ||
    process.env.TEXT_PROVIDER ||
    "gemini"
  );
}

export async function getImageProviderName(): Promise<string> {
  return (
    (await getSetting("IMAGE_PROVIDER")) ||
    process.env.IMAGE_PROVIDER ||
    "pollinations"
  );
}

export async function getVideoProvider(): Promise<string> {
  return (
    (await getSetting("VIDEO_PROVIDER")) ||
    process.env.VIDEO_PROVIDER ||
    "ffmpeg"
  );
}

export async function getApiKey(name: string): Promise<string> {
  return (await getSetting(name)) || process.env[name] || "";
}

export async function getImageModel(): Promise<string> {
  return (
    (await getSetting("IMAGE_MODEL_HUGGINGFACE")) ||
    "black-forest-labs/FLUX.1-schnell"
  );
}

// Image scene style: "product" (depict the product in context) | "abstract" (brand-mood still-life)
export async function getImageStyle(): Promise<string> {
  return (
    (await getSetting("IMAGE_STYLE")) ||
    process.env.IMAGE_STYLE ||
    "product"
  );
}
