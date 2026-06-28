// Phase 3 verification: brainstorm engine prompt assembly + response parsing.
// Run: npx tsx scripts/test-brainstorm.ts
import { buildBrainstormPrompt, parseBrainstormResponse } from "../src/lib/brain/prompts";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const profile = {
  name: "Buzz",
  tagline: "ship marketing while you sleep",
  coreValue: "auto-generate on-brand social posts",
  differentiators: ["writes the post too", "learns your brand voice"],
  audience: { primary: "solo SaaS founders" },
  customerSegments: [
    { label: "Indie hacker", painPoints: ["no time for marketing"], desires: ["consistent presence"], messagingAngle: "marketing on autopilot" },
  ],
};
const strategy = {
  hooks: ["tired of the blank canva screen?"],
  painPoints: ["staring at a blank screen"],
  desirePoints: ["look consistent without effort"],
  contentPillars: ["education", "behind the scenes"],
  objections: [{ objection: "AI content sounds generic", counter: "it learns your voice" }],
};

console.log("======== buildBrainstormPrompt ========");
const prompt = buildBrainstormPrompt(profile, strategy, { count: 6, theme: "launch week" });
check("injects brainstorming pack", prompt.includes("Idea Generation & Brainstorming Playbook"));
check("has EXPERT KNOWLEDGE header", prompt.includes("EXPERT KNOWLEDGE"));
check("mentions product name", prompt.includes("Buzz"));
check("honors count", prompt.includes("exactly 6 ideas"));
check("includes focus theme", prompt.includes("launch week"));
check("feeds existing hooks as baseline", prompt.includes("blank canva screen"));
check("defines JSON schema", prompt.includes('"riskiestAssumption"') && prompt.includes('"scores"'));
check("no em dash in prompt scaffolding", !prompt.includes("—"));

console.log("\n======== parseBrainstormResponse ========");
const sample = '```json\n[' +
  '{"title":"Build-in-public teardown","kind":"series","hook":"I let AI write my launch posts for 7 days.","whyItWorks":"curiosity + relief from blank-page pain","format":"X thread","riskiestAssumption":"founders care about process","scores":{"novelty":4,"fit":5,"feasibility":5}},' +
  '{"title":"","hook":""},' +
  '{"kind":"weird","title":"Coerced kind + clamped scores","hook":"h","whyItWorks":"w","format":"f","riskiestAssumption":"r","scores":{"novelty":9,"fit":0}}' +
  ']\n```';
const ideas = parseBrainstormResponse(sample);
check("drops invalid (titleless) idea", ideas.length === 2);
check("parses first idea fully", ideas[0]?.title === "Build-in-public teardown" && ideas[0]?.kind === "series");
check("coerces unknown kind to 'post'", ideas[1]?.kind === "post");
check("clamps novelty 9 -> 5", ideas[1]?.scores.novelty === 5);
check("clamps fit 0 -> 1", ideas[1]?.scores.fit === 1);
check("defaults missing feasibility -> 3", ideas[1]?.scores.feasibility === 3);
check("garbage input -> []", parseBrainstormResponse("no json here").length === 0);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
