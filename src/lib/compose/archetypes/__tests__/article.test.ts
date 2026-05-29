import { describe, it, expect } from "vitest";
import { article } from "@/lib/compose/archetypes/article";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("article archetype", () => {
  const scene = article(KIT, makeBrief("article"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a kicker pill, headline, and body slots", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("pill");
    expect(slots).toContain("headline");
    expect(slots).toContain("body");
  });
  it("renders a logo element when the kit provides a logo src", () => {
    const logo = scene.elements.find((e) => e.type === "logo");
    expect(logo).toBeTruthy();
    expect(logo && "src" in logo ? logo.src : "").toBe(KIT.logo.src);
  });
  it("omits the logo when the kit has no logo src", () => {
    const noLogoKit = { ...KIT, logo: {} };
    const s2 = article(noLogoKit, makeBrief("article"));
    expect(s2.elements.some((e) => e.type === "logo")).toBe(false);
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
