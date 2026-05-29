import { describe, it, expect } from "vitest";
import { stat } from "@/lib/compose/archetypes/stat";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("stat archetype", () => {
  const scene = stat(KIT, makeBrief("stat", { headline: "92%" }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("uses a statBlock element carrying value + label", () => {
    const sb = scene.elements.find((e) => e.type === "statBlock");
    expect(sb).toBeTruthy();
    expect(sb && "value" in sb ? sb.value : "").toBe("92%");
  });
  it("exposes a stat slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("stat");
  });
  it("colors the stat value with the accent", () => {
    const sb = scene.elements.find((e) => e.type === "statBlock");
    expect(sb && "valueColor" in sb ? sb.valueColor : "").toBe("#ff3366");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
