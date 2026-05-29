import type { ArchetypeBuilder, ArchetypeId } from "./types";

export type { ArchetypeId, Brief, ArchetypeBuilder } from "./types";
export { ARCHETYPE_IDS } from "./types";

export const ARCHETYPES: Record<ArchetypeId, ArchetypeBuilder> = {} as Record<
  ArchetypeId,
  ArchetypeBuilder
>;
