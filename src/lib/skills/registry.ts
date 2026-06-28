import type { EngineId } from "./types";

/**
 * Engine -> knowledge packs, highest priority first.
 *
 * When the composed knowledge would exceed the token budget, packs are dropped
 * from the END of each list. Packs whose files do not exist yet are skipped, so
 * an engine works with whatever packs are currently authored.
 */
export const ENGINE_PACKS: Record<EngineId, string[]> = {
  "profile-strategy": ["marketing-strategy", "profile-persona", "market-intelligence"],
  content: ["copywriting", "social-content"],
  brainstorming: ["brainstorming", "marketing-strategy"],
  "plan-generation": ["product-plan", "product-brief", "marketing-strategy"],
};
