import { describe, it, expect } from "vitest";
import { announce } from "@/lib/compose/archetypes/announce";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("announce archetype", () => {
  const scene = announce(KIT, makeBrief("announce"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("uses the accent as the scene background fill", () => {
    expect(scene.background.kind).toBe("solid");
    expect(scene.background.kind === "solid" ? scene.background.color : "").toBe("#ff3366");
  });
  it("has a pill + headline + button (cta) slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("pill");
    expect(slots).toContain("headline");
    expect(slots).toContain("cta");
  });
  it("headline uses the onAccent color for contrast", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "color" in head ? head.color : "").toBe(KIT.palette.onAccent);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
