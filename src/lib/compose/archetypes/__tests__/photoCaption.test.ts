import { describe, it, expect } from "vitest";
import { photoCaption } from "@/lib/compose/archetypes/photoCaption";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("photoCaption archetype", () => {
  const scene = photoCaption(KIT, makeBrief("photoCaption", { imagery: { kind: "photo", scene: "/api/media/p.png" } }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has an image element occupying the top region", () => {
    const img = scene.elements.find((e) => e.type === "image");
    expect(img).toBeTruthy();
    expect(img!.y).toBe(0);
    expect(img!.h).toBeLessThan(SCENE_H);
  });
  it("places headline + body in the caption strip", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
