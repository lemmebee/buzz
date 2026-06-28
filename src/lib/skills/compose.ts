import { ENGINE_PACKS } from "./registry";
import { readPack } from "./loader";
import type { EngineId, Pack } from "./types";

// Max tokens of knowledge injected per prompt. Generous for Gemini; the
// Antigravity CLI tolerates this too. Sized so each engine's full pack set fits
// (~3 packs). Provider-specific tuning is a later phase.
const DEFAULT_BUDGET = 2200;

export interface ComposeOptions {
  /** Max tokens of knowledge to inject. Lower it for latency-sensitive providers. */
  budget?: number;
}

/** Skills are on unless SKILLS_ENABLED is explicitly turned off. */
export function skillsEnabled(): boolean {
  const v = (process.env.SKILLS_ENABLED || "").toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
}

/**
 * Build the expert-knowledge block to inject into an engine's system prompt.
 *
 * Returns "" when disabled or when no packs are available, so callers can append
 * it unconditionally. The knowledge travels inside the prompt text, so it works
 * for every provider (Gemini API, Antigravity CLI, HuggingFace) with nothing
 * installed on the provider side.
 */
export function composeSkillSection(engine: EngineId, opts: ComposeOptions = {}): string {
  if (!skillsEnabled()) return "";

  const budget = opts.budget ?? DEFAULT_BUDGET;
  const ids = ENGINE_PACKS[engine] || [];

  const packs: Pack[] = [];
  let spent = 0;
  for (const id of ids) {
    const pack = readPack(id);
    if (!pack) continue; // not authored yet — skip
    // Always include the top-priority pack; stop once the budget is reached.
    if (packs.length > 0 && spent + pack.tokenEstimate > budget) break;
    packs.push(pack);
    spent += pack.tokenEstimate;
  }

  if (packs.length === 0) return "";

  return [
    "",
    "## EXPERT KNOWLEDGE (apply these frameworks; internalize them, do not quote them verbatim)",
    "Use the playbooks below to raise the quality of your output. They are reference frameworks, not text to copy into the result. Always honor the output format defined elsewhere in this prompt.",
    "",
    packs.map((p) => p.body).join("\n\n---\n\n"),
    "",
  ].join("\n");
}
