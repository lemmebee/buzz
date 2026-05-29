import type { HookType } from "@/lib/brain/types";
import { suggestLeastUsed } from "@/lib/brain/rotation";
import { ARCHETYPE_IDS, type ArchetypeId } from "./types";

// Preferred candidates per hook type. First entry is the default when usage is flat.
const RULE_MAP: Record<HookType, ArchetypeId[]> = {
  pain: ["editorial"],
  curiosity: ["editorial"],
  desire: ["displayImage"],
  contrarian: ["displayImage"],
  "social-proof": ["quote", "stat"],
};

// Threshold above which a preferred pick is considered saturated and we fall
// back to the global least-used archetype to keep the rotation fresh.
const SATURATION = 3;

export function selectArchetype(
  hookType: HookType,
  usage: Record<string, number>,
): ArchetypeId {
  const preferred = RULE_MAP[hookType] ?? ["editorial"];

  // Among the preferred candidates, take the least used (stable: ties -> first listed).
  const preferredPick = suggestLeastUsed(preferred, usage) ?? preferred[0];

  // If the chosen preferred archetype is saturated, rotate to the globally
  // least-used archetype across all 10 ids. suggestLeastUsed keeps the first
  // listed id on ties, so ARCHETYPE_IDS order is the tiebreak.
  if ((usage[preferredPick] ?? 0) > SATURATION) {
    const global = suggestLeastUsed([...ARCHETYPE_IDS], usage);
    if (global) return global;
  }

  return preferredPick;
}
