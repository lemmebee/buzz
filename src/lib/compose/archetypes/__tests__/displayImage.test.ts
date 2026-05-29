import { describe, it, expect } from "vitest";
import { displayImage } from "@/lib/compose/archetypes/displayImage";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("displayImage archetype", () => {
  const scene = displayImage(KIT, makeBrief("displayImage", { imagery: { kind: "photo", scene: "/api/media/p.png" } }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a full-bleed background image when imagery is photo", () => {
    expect(scene.background.kind).toBe("image");
  });
  it("overlays headline + bg scrim slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("bg");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
  it("headline uses ink color over the scrim", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "color" in head ? head.color : "").toBe(KIT.palette.ink);
  });
});
