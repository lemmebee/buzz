import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ProductProfile, MarketingStrategy } from "@/lib/brain/types";
import type { ContentPurpose, MediaType, ContentTargeting } from "@/lib/brain/types";
import type { BrainstormIdeaRow } from "../../../drizzle/schema";
import type { ContentConfig } from "@/lib/content/defaults";
import { ensureProductAssetsUploaded } from "./assets";

export interface HiggsfieldContext {
  name: string;
  description: string;
  planFile?: string | null;
  profile?: ProductProfile | null;
  marketingStrategy?: MarketingStrategy | null;
  icp?: unknown;
  jtbd?: unknown;
  channelHints?: string[] | null;
  llmInstructions?: string | null;
  brainstormIdeas: BrainstormIdeaRow[];
  instagramHandle?: string | null;
  targetSurface: ContentPurpose;
  mediaType: MediaType;
  config: ContentConfig;
  targeting?: ContentTargeting;
  logoMediaId?: string;
  screenshotMediaIds: string[];
  /** Higgsfield media id -> local /api/media path, so traces can preview assets. */
  mediaIdToPath: Record<string, string>;
  textProvider?: string | null;
}

interface GatherInput {
  productId: number;
  targetSurface: ContentPurpose;
  mediaType: MediaType;
  config: ContentConfig;
  targeting?: ContentTargeting;
  skipAssetUpload?: boolean;
}

function safeJsonParse<T>(raw: string | null | undefined, label: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[higgsfield] failed to parse ${label} JSON:`, err);
    return null;
  }
}

export async function gatherContext(input: GatherInput): Promise<HiggsfieldContext> {
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, input.productId),
  });
  if (!product) {
    throw new Error(`Product ${input.productId} not found`);
  }

  const profile = safeJsonParse<ProductProfile>(product.profile, "profile");
  const marketingStrategy = safeJsonParse<MarketingStrategy>(product.marketingStrategy, "marketingStrategy");

  const brainstormIdeas = await db.query.brainstormIdeas.findMany({
    where: eq(schema.brainstormIdeas.productId, input.productId),
  });

  let instagramHandle: string | null = null;
  if (product.instagramAccountId) {
    const igAccount = await db.query.instagramAccounts.findFirst({
      where: eq(schema.instagramAccounts.id, product.instagramAccountId),
    });
    if (igAccount?.username) {
      instagramHandle = `@${igAccount.username}`;
    }
  }

  let logoMediaId: string | undefined;
  let screenshotMediaIds: string[] = [];
  let mediaIdToPath: Record<string, string> = {};

  if (!input.skipAssetUpload) {
    const assets = await ensureProductAssetsUploaded(input.productId);
    logoMediaId = assets.logoMediaId;
    screenshotMediaIds = assets.screenshotMediaIds;
    mediaIdToPath = assets.mediaIdToPath ?? {};
  }

  return {
    name: product.name,
    description: product.description,
    planFile: product.planFile,
    profile,
    marketingStrategy,
    icp: product.icp,
    jtbd: product.jtbd,
    channelHints: product.channelHints as string[] | null,
    llmInstructions: product.llmInstructions,
    brainstormIdeas,
    instagramHandle,
    targetSurface: input.targetSurface,
    mediaType: input.mediaType,
    config: input.config,
    targeting: input.targeting,
    logoMediaId,
    mediaIdToPath,
    screenshotMediaIds,
    textProvider: product.textProvider,
  };
}
