// Phase 1/2 verification for the Skills Knowledge Engine.
// Run: npx tsx scripts/test-skills.ts
import { composeSkillSection, skillsEnabled, readPack, ENGINE_PACKS } from "../src/lib/skills";
import type { EngineId } from "../src/lib/skills";

const TITLES: Record<string, string> = {
  "marketing-strategy": "Marketing Strategy & Positioning Playbook",
  copywriting: "Conversion Copywriting & Persuasion Playbook",
  "profile-persona": "Customer Persona & ICP Playbook",
  "market-intelligence": "Market & Competitive Intelligence Playbook",
  brainstorming: "Idea Generation & Brainstorming Playbook",
  "product-plan": "Marketing Plan Playbook",
  "product-brief": "Marketing Brief Playbook",
  "social-content": "Social Content Strategy Playbook",
};

function line(label: string) {
  console.log("\n" + "=".repeat(8) + " " + label + " " + "=".repeat(8));
}

line("toggle");
console.log("skillsEnabled():", skillsEnabled());

line("every referenced pack loads (no nulls expected now)");
const allIds = Array.from(new Set(Object.values(ENGINE_PACKS).flat()));
for (const id of allIds) {
  const p = readPack(id);
  console.log(`${id.padEnd(22)} ${p ? `tokenEstimate=${p.tokenEstimate}` : "NULL (missing!)"}`);
}

line("composition per engine (which packs make the budget)");
for (const engine of Object.keys(ENGINE_PACKS) as EngineId[]) {
  const section = composeSkillSection(engine);
  const included = ENGINE_PACKS[engine].filter((id) => section.includes(TITLES[id]));
  const dropped = ENGINE_PACKS[engine].filter((id) => !section.includes(TITLES[id]));
  const estTokens = included.reduce((s, id) => s + (readPack(id)?.tokenEstimate || 0), 0);
  console.log(`\n${engine}`);
  console.log(`  included: [${included.join(", ")}]  (~${estTokens} tok, ${section.length} chars)`);
  if (dropped.length) console.log(`  dropped : [${dropped.join(", ")}]`);
}

line("disable toggle");
process.env.SKILLS_ENABLED = "false";
console.log("composeSkillSection('content') when disabled -> length:", composeSkillSection("content").length);
process.env.SKILLS_ENABLED = "";

console.log("\nAll checks ran.");
