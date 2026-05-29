import { describe, it, expect } from "vitest";
import { iconCard } from "@/lib/compose/archetypes/iconCard";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("iconCard archetype", () => {
  const scene = iconCard(KIT, makeBrief("iconCard"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has an icon element with the kit icon style", () => {
    const icon = scene.elements.find((e) => e.type === "icon");
    expect(icon).toBeTruthy();
    expect(icon && "iconStyle" in icon ? icon.iconStyle : "").toBe("line");
  });
  it("contains icon + headline + body slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("icon");
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
