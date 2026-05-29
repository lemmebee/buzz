import { describe, it, expect } from "vitest";
import { feature } from "@/lib/compose/archetypes/feature";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("feature archetype", () => {
  const scene = feature(KIT, makeBrief("feature", { body: "Auto angle\nOne-tap edit\nScheduled ship" }));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has headline + subhead slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("headline");
    expect(slots).toContain("subhead");
  });
  it("renders an icon per feature line plus a label per line", () => {
    const icons = scene.elements.filter((e) => e.type === "icon");
    const labels = scene.elements.filter((e) => e.id.startsWith("featLabel"));
    expect(icons.length).toBe(3);
    expect(labels.length).toBe(3);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
