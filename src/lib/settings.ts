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
    "CONTENT_ENGINE",
    "HIGGSFIELD_IMAGE_MODEL",
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


async function getNumericSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Pipeline tuning. These were hardcoded constants scattered across the
 * codebase, which made it impossible to tell — without reading source — how
 * much of a product the models were actually being shown. Each one trades
 * output quality against tokens, cost and latency, so they belong in Settings.
 */
export const PIPELINE_DEFAULTS = {
  EXTRACTION_MAX_IMAGES: 10,
  CONTENT_MAX_IMAGES: 4,
  IMAGE_MAX_DIMENSION: 1024,
  IMAGE_JPEG_QUALITY: 70,
  HIGGSFIELD_MAX_ASSETS: 4,
  PLAN_FILE_CHAR_CAP: 4000,
} as const;

/** Screenshots read when building the product profile. Drives every later prompt. */
export const getExtractionMaxImages = () =>
  getNumericSetting("EXTRACTION_MAX_IMAGES", PIPELINE_DEFAULTS.EXTRACTION_MAX_IMAGES);

/** Images attached when authoring captions and image prompts. */
export const getContentMaxImages = () =>
  getNumericSetting("CONTENT_MAX_IMAGES", PIPELINE_DEFAULTS.CONTENT_MAX_IMAGES);

/** Longest edge images are downscaled to before being sent to a model. */
export const getImageMaxDimension = () =>
  getNumericSetting("IMAGE_MAX_DIMENSION", PIPELINE_DEFAULTS.IMAGE_MAX_DIMENSION);

/** JPEG quality for those downscaled images. */
export const getImageJpegQuality = () =>
  getNumericSetting("IMAGE_JPEG_QUALITY", PIPELINE_DEFAULTS.IMAGE_JPEG_QUALITY);

/** Product assets uploaded to Higgsfield for use as generation references. */
export const getHiggsfieldMaxAssets = () =>
  getNumericSetting("HIGGSFIELD_MAX_ASSETS", PIPELINE_DEFAULTS.HIGGSFIELD_MAX_ASSETS);

/** Characters of the marketing brief included in a generation prompt. */
export const getPlanFileCharCap = () =>
  getNumericSetting("PLAN_FILE_CHAR_CAP", PIPELINE_DEFAULTS.PLAN_FILE_CHAR_CAP);


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
