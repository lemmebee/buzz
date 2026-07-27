import type { ContentPurpose } from "@/lib/brain/types";
import type { HiggsfieldModel } from "./client";

// Preferred aspect ratios per surface type
const PREFERRED_ASPECT_RATIOS: Record<ContentPurpose, string[]> = {
  post: ["1:1", "4:5", "auto"],
  story: ["9:16", "auto"],
  reel: ["9:16", "auto"],
  ad: ["4:5", "1:1", "auto"],
};

/**
 * Resolve the media role for a model.
 * Returns the roleOverride if present, otherwise the first role from medias[0].roles, or null if no reference support.
 */
export function resolveMediaRole(model: HiggsfieldModel): string | null {
  // Use roleOverride if present (self-healed from API rejection)
  if (model.roleOverride) {
    return model.roleOverride;
  }
  
  if (!model.medias || model.medias.length === 0) return null;
  const roles = model.medias[0].roles;
  if (!roles || roles.length === 0) return null;
  return roles[0];
}

/**
 * Resolve the maximum number of medias a model accepts.
 * Defaults to 1 when max is absent (marketing_studio_image fails with 2).
 */
export function resolveMaxMedias(model: HiggsfieldModel): number {
  if (!model.medias || model.medias.length === 0) return 0;
  return model.medias[0].max ?? 1;
}

/**
 * Check if a model supports reference images.
 * A model with medias.length === 0 or medias[0].roles.length === 0 cannot use references.
 */
export function supportsReferences(model: HiggsfieldModel): boolean {
  if (!model.medias || model.medias.length === 0) return false;
  const roles = model.medias[0].roles;
  return roles && roles.length > 0;
}

/**
 * Resolve the aspect ratio for a model and surface.
 * Tries preferred ratios for the surface, then first available, then "auto".
 * Logs when a fallback is used.
 */
export function resolveAspectRatio(model: HiggsfieldModel, surface: ContentPurpose): string {
  const available = model.aspect_ratios || [];
  
  if (available.length === 0) {
    console.log(`[higgsfield] model ${model.id} has no aspect_ratios, using "auto"`);
    return "auto";
  }

  // Try preferred ratios for this surface
  const preferred = PREFERRED_ASPECT_RATIOS[surface] || [];
  for (const ratio of preferred) {
    if (available.includes(ratio)) {
      return ratio;
    }
  }

  // Fallback to first available
  const fallback = available[0];
  if (fallback !== preferred[0]) {
    console.log(`[higgsfield] model ${model.id} does not support preferred aspect ratio for ${surface}, using "${fallback}"`);
  }
  return fallback;
}

/**
 * Resolve the duration for a model.
 * Checks three sources in order:
 * 1. Top-level durations[] - snap to nearest
 * 2. Top-level duration_range - clamp
 * 3. parameters[] entry named "duration" - use options[] or min/max
 * 
 * When no duration is requested, defaults to the shortest sensible option
 * (first in durations[], range.min, or first in parameters[].options[]).
 * Returns undefined if the model declares no duration constraints.
 * Logs when adjusted or when defaulting.
 */
export function resolveDuration(model: HiggsfieldModel, requested?: number): number | undefined {
  const durations = model.durations;
  const range = model.duration_range;
  
  // Check parameters[] for duration entry
  const durationParam = model.parameters?.find(p => p.name === "duration");
  const paramOptions = durationParam?.options?.filter((o): o is number => typeof o === "number") || [];
  const paramMin = typeof durationParam?.min === "number" ? durationParam.min : undefined;
  const paramMax = typeof durationParam?.max === "number" ? durationParam.max : undefined;

  // If no duration constraints anywhere, omit entirely
  if (!durations?.length && !range && !paramOptions.length && paramMin == null) {
    return undefined;
  }

  // If no requested duration, use the shortest sensible option
  if (requested == null) {
    if (durations?.length) {
      const shortest = durations[0];
      console.log(`[higgsfield] model ${model.id} defaulting to shortest duration: ${shortest}s`);
      return shortest;
    }
    if (range) {
      console.log(`[higgsfield] model ${model.id} defaulting to duration range min: ${range.min}s`);
      return range.min;
    }
    if (paramOptions.length) {
      const shortest = paramOptions[0];
      console.log(`[higgsfield] model ${model.id} defaulting to shortest duration from parameters: ${shortest}s`);
      return shortest;
    }
    if (paramMin != null) {
      console.log(`[higgsfield] model ${model.id} defaulting to parameter min duration: ${paramMin}s`);
      return paramMin;
    }
    return undefined;
  }

  // Snap to nearest allowed duration (top-level durations[])
  if (durations?.length) {
    let nearest = durations[0];
    let minDiff = Math.abs(requested - nearest);
    for (const d of durations) {
      const diff = Math.abs(requested - d);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = d;
      }
    }
    if (nearest !== requested) {
      console.log(`[higgsfield] model ${model.id} does not support duration ${requested}s, using ${nearest}s`);
    }
    return nearest;
  }

  // Clamp into top-level duration_range
  if (range) {
    const clamped = Math.max(range.min, Math.min(range.max, requested));
    if (clamped !== requested) {
      console.log(`[higgsfield] model ${model.id} duration ${requested}s out of range ${range.min}-${range.max}s, using ${clamped}s`);
    }
    return clamped;
  }

  // Snap to nearest from parameters[].options[]
  if (paramOptions.length) {
    let nearest = paramOptions[0];
    let minDiff = Math.abs(requested - nearest);
    for (const d of paramOptions) {
      const diff = Math.abs(requested - d);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = d;
      }
    }
    if (nearest !== requested) {
      console.log(`[higgsfield] model ${model.id} does not support duration ${requested}s, using ${nearest}s (from parameters)`);
    }
    return nearest;
  }

  // Clamp into parameters[] min/max
  if (paramMin != null && paramMax != null) {
    const clamped = Math.max(paramMin, Math.min(paramMax, requested));
    if (clamped !== requested) {
      console.log(`[higgsfield] model ${model.id} duration ${requested}s out of parameter range ${paramMin}-${paramMax}s, using ${clamped}s`);
    }
    return clamped;
  }

  return requested;
}

/**
 * Build the medias array for a generation call.
 * Caps at resolveMaxMedias(model) and uses resolveMediaRole(model).
 * Returns empty array if model does not support references.
 */
export function buildMediasArray(
  model: HiggsfieldModel,
  mediaIds: string[]
): Array<{ value: string; role: string }> {
  if (!supportsReferences(model)) {
    return [];
  }

  const role = resolveMediaRole(model);
  if (!role) return [];

  const maxMedias = resolveMaxMedias(model);
  const capped = mediaIds.slice(0, maxMedias);

  if (capped.length < mediaIds.length) {
    console.log(`[higgsfield] model ${model.id} accepts max ${maxMedias} references, using ${capped.length} of ${mediaIds.length}`);
  }

  return capped.map((id) => ({ value: id, role }));
}
