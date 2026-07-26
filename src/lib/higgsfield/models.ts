import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { hfListModelsByType, hfGetCost, type HiggsfieldModel } from "./client";

// Seeded costs for common models — avoids fetching on first page load
const SEEDED_COSTS: Record<string, number> = {
  marketing_studio_image: 2,
  veo3_1_lite: 4,
  kling3_0_turbo: 7.5,
  seedance_2_0_mini: 12.5,
  marketing_studio_video: 60,
};

export interface CachedModels {
  models: HiggsfieldModel[];
  fetchedAt: string;
}

export async function getCachedModels(): Promise<CachedModels | null> {
  const rows = await db.select().from(schema.higgsfieldModels);
  if (rows.length === 0) return null;

  const models: HiggsfieldModel[] = rows.map((row) => ({
    id: row.id,
    name: row.name || row.id,
    provider_name: row.providerName || undefined,
    description: row.description || undefined,
    output_type: row.outputType,
    aspect_ratios: row.aspectRatios ? JSON.parse(row.aspectRatios) : undefined,
    duration_range: row.durationRangeMin != null && row.durationRangeMax != null
      ? { min: row.durationRangeMin, max: row.durationRangeMax }
      : undefined,
    durations: row.durations ? JSON.parse(row.durations) : undefined,
    medias: row.medias ? JSON.parse(row.medias) : undefined,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
    baseCredits: row.baseCredits || undefined,
  }));

  const fetchedAt = rows[0].fetchedAt.toISOString();
  return { models, fetchedAt };
}

export async function setCachedModels(models: HiggsfieldModel[]): Promise<void> {
  const now = new Date();

  // Clear existing cache
  await db.delete(schema.higgsfieldModels);

  // Insert new models
  if (models.length > 0) {
    await db.insert(schema.higgsfieldModels).values(
      models.map((m) => ({
        id: m.id,
        name: m.name || null,
        providerName: m.provider_name || null,
        description: m.description || null,
        outputType: m.output_type,
        aspectRatios: m.aspect_ratios ? JSON.stringify(m.aspect_ratios) : null,
        durationRangeMin: m.duration_range?.min ?? null,
        durationRangeMax: m.duration_range?.max ?? null,
        durations: m.durations ? JSON.stringify(m.durations) : null,
        medias: m.medias ? JSON.stringify(m.medias) : null,
        parameters: m.parameters ? JSON.stringify(m.parameters) : null,
        baseCredits: m.baseCredits ?? null,
        fetchedAt: now,
      }))
    );
  }
}

export async function refreshModelsCache(): Promise<{ count: number; errors: number }> {
  let count = 0;
  let errors = 0;

  try {
    // Catalog only — no bulk costing (M16: cost is lazy, fetched on demand)
    // Call each type separately to avoid payload truncation
    const [imageModels, videoModels] = await Promise.allSettled([
      hfListModelsByType("image"),
      hfListModelsByType("video"),
    ]);

    const models: HiggsfieldModel[] = [];

    if (imageModels.status === "fulfilled") {
      models.push(...imageModels.value);
    } else {
      errors++;
      console.error("[higgsfield] failed to fetch image models:", imageModels.reason);
    }

    if (videoModels.status === "fulfilled") {
      models.push(...videoModels.value);
    } else {
      errors++;
      console.error("[higgsfield] failed to fetch video models:", videoModels.reason);
    }

    count = models.length;

    // Apply seeded costs to known models
    const modelsWithSeededCosts = models.map((m) => ({
      ...m,
      baseCredits: SEEDED_COSTS[m.id] ?? m.baseCredits,
    }));

    await setCachedModels(modelsWithSeededCosts);
    return { count, errors };
  } catch (err) {
    errors++;
    console.error("[higgsfield] failed to refresh models cache:", err);
    return { count, errors };
  }
}

export async function getModelById(modelId: string): Promise<HiggsfieldModel | null> {
  const row = await db.query.higgsfieldModels.findFirst({
    where: eq(schema.higgsfieldModels.id, modelId),
  });

  if (!row) return null;

  return {
    id: row.id,
    name: row.name || row.id,
    provider_name: row.providerName || undefined,
    description: row.description || undefined,
    output_type: row.outputType,
    aspect_ratios: row.aspectRatios ? JSON.parse(row.aspectRatios) : undefined,
    duration_range: row.durationRangeMin != null && row.durationRangeMax != null
      ? { min: row.durationRangeMin, max: row.durationRangeMax }
      : undefined,
    durations: row.durations ? JSON.parse(row.durations) : undefined,
    medias: row.medias ? JSON.parse(row.medias) : undefined,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
    baseCredits: row.baseCredits || undefined,
  };
}

export async function getModelsByType(type: "image" | "video"): Promise<HiggsfieldModel[]> {
  const rows = await db.select().from(schema.higgsfieldModels)
    .where(eq(schema.higgsfieldModels.outputType, type));

  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.id,
    provider_name: row.providerName || undefined,
    description: row.description || undefined,
    output_type: row.outputType,
    aspect_ratios: row.aspectRatios ? JSON.parse(row.aspectRatios) : undefined,
    duration_range: row.durationRangeMin != null && row.durationRangeMax != null
      ? { min: row.durationRangeMin, max: row.durationRangeMax }
      : undefined,
    durations: row.durations ? JSON.parse(row.durations) : undefined,
    medias: row.medias ? JSON.parse(row.medias) : undefined,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
    baseCredits: row.baseCredits || undefined,
  })).sort((a, b) => (a.baseCredits ?? 999) - (b.baseCredits ?? 999));
}

// Fetch cost for a single model on demand (M16: lazy costing)
export async function fetchModelCost(modelId: string): Promise<number | null> {
  const model = await getModelById(modelId);
  if (!model) return null;

  // Route by output_type — never call generate_video for an image model
  const kind = model.output_type === "image" ? "image" : "video";
  if (kind !== "image" && kind !== "video") return null;

  try {
    const cost = await hfGetCost(kind, { model: modelId });
    if (cost > 0) {
      // Update the cached model with the cost
      await db.update(schema.higgsfieldModels)
        .set({ baseCredits: cost })
        .where(eq(schema.higgsfieldModels.id, modelId));
      return cost;
    }
    return null;
  } catch {
    return null;
  }
}
