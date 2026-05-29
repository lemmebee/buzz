import { describe, it, expect } from "vitest";
import { steps } from "@/lib/compose/archetypes/steps";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("steps archetype", () => {
  const scene = steps(KIT, makeBrief("steps", { body: "Pick a product.\nGet a week of posts.\nShip it." }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a headline slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
  });
  it("renders one numbered row per body line (3 here)", () => {
    const numbers = scene.elements.filter((e) => e.id.startsWith("stepNum"));
    expect(numbers).toHaveLength(3);
    const rows = scene.elements.filter((e) => e.id.startsWith("stepText"));
    expect(rows).toHaveLength(3);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
