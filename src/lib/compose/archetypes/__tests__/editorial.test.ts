import { describe, it, expect } from "vitest";
import { editorial } from "@/lib/compose/archetypes/editorial";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("editorial archetype", () => {
  const scene = editorial(KIT, makeBrief("editorial"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("contains the required slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("subhead");
    expect(slots).toContain("body");
  });
  it("keeps every element within canvas bounds", () => {
    for (const el of scene.elements) {
      expect(withinBounds(el)).toBe(true);
    }
  });
  it("renders headline text from the brief", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "content" in head ? head.content : "").toContain("Stop guessing");
  });
  it("uses the display font family for the headline", () => {
    const head = scene.elements.find((e) => e.slot === "headline");
    expect(head && "fontFamily" in head ? head.fontFamily : "").toBe(KIT.type.display.family);
  });
  it("uses accent[0] when accentIndex is 0", () => {
    const colors = scene.elements.flatMap((e) =>
      "color" in e ? [e.color] : "fill" in e && e.fill ? [e.fill] : [],
    );
    expect(colors).toContain("#ff3366");
  });
});
