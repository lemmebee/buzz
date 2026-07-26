import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await getSetting(key);
  if (existing === null) {
    await db.insert(schema.settings).values({ key, value });
  } else {
    await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key));
  }
}

// One-time migration: seed settings from env vars if DB rows don't exist
export async function seedSettingsFromEnv(): Promise<void> {
  const configKeys = [
    "TEXT_PROVIDER",
    "IMAGE_PROVIDER",
    "VIDEO_PROVIDER",
    "CONTENT_ENGINE",
    "HIGGSFIELD_IMAGE_MODEL",
    "HIGGSFIELD_VIDEO_MODEL",
    "IMAGE_STYLE",
    "IMAGE_MODEL_HUGGINGFACE",
    "ANTIGRAVITY_BIN",
    "ANTIGRAVITY_MODEL",
    "CLAUDE_CODE_BIN",
    "CLAUDE_CODE_MODEL",
  ];

  for (const key of configKeys) {
    const existing = await getSetting(key);
    if (existing === null && process.env[key]) {
      await setSetting(key, process.env[key]!);
      console.log(`[settings] seeded ${key} from env`);
    }
  }
}

export async function getTextProvider(): Promise<string> {
  return (await getSetting("TEXT_PROVIDER")) || "gemini";
}

export async function getImageProviderName(): Promise<string> {
  return (await getSetting("IMAGE_PROVIDER")) || "pollinations";
}

export async function getVideoProvider(): Promise<string> {
  return (await getSetting("VIDEO_PROVIDER")) || "ffmpeg";
}

export async function getApiKey(name: string): Promise<string> {
  return (await getSetting(name)) || process.env[name] || "";
}

export async function getImageModel(): Promise<string> {
  return (await getSetting("IMAGE_MODEL_HUGGINGFACE")) || "black-forest-labs/FLUX.1-schnell";
}

export async function getContentEngine(): Promise<string> {
  return (await getSetting("CONTENT_ENGINE")) || "buzz";
}

export async function resolveContentEngine(productId?: number): Promise<"buzz" | "higgsfield"> {
  // Resolution: product column → global CONTENT_ENGINE setting → "buzz"
  if (productId) {
    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, productId),
    });
    if (product?.contentEngine === "buzz" || product?.contentEngine === "higgsfield") {
      return product.contentEngine;
    }
    if (product?.contentEngine && product.contentEngine !== "buzz" && product.contentEngine !== "higgsfield") {
      console.warn(`[higgsfield] product ${productId} has unrecognised contentEngine "${product.contentEngine}", falling back to global`);
    }
  }

  const global = await getContentEngine();
  if (global === "higgsfield") return "higgsfield";
  if (global !== "buzz") {
    console.warn(`[higgsfield] unrecognised CONTENT_ENGINE "${global}", defaulting to "buzz"`);
  }
  return "buzz";
}

export async function getHiggsfieldImageModel(productId?: number): Promise<string> {
  // Resolution: product override → global setting → default
  if (productId) {
    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, productId),
    });
    if (product?.higgsfieldImageModel) {
      return product.higgsfieldImageModel;
    }
  }
  return (await getSetting("HIGGSFIELD_IMAGE_MODEL")) || "marketing_studio_image";
}

export async function getHiggsfieldVideoModel(productId?: number): Promise<string> {
  // Resolution: product override → global setting → default
  if (productId) {
    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, productId),
    });
    if (product?.higgsfieldVideoModel) {
      return product.higgsfieldVideoModel;
    }
  }
  return (await getSetting("HIGGSFIELD_VIDEO_MODEL")) || "veo3_1_lite";
}

// Image scene style: "product" (depict the product in context) | "abstract" (brand-mood still-life)
export async function getImageStyle(): Promise<string> {
  return (await getSetting("IMAGE_STYLE")) || "product";
}

export async function getAntigravityBin(): Promise<string> {
  return (await getSetting("ANTIGRAVITY_BIN")) || "/home/mrg/.local/bin/agy";
}

export async function getAntigravityModel(): Promise<string> {
  return (await getSetting("ANTIGRAVITY_MODEL")) || "GPT-OSS 120B (Medium)";
}

export async function getClaudeCodeBin(): Promise<string> {
  return (await getSetting("CLAUDE_CODE_BIN")) || "/home/mrg/.local/bin/claude";
}

export async function getClaudeCodeModel(): Promise<string> {
  return (await getSetting("CLAUDE_CODE_MODEL")) || "haiku";
}
