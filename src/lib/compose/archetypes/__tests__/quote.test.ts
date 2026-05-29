import { describe, it, expect } from "vitest";
import { quote } from "@/lib/compose/archetypes/quote";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("quote archetype", () => {
  const scene = quote(KIT, makeBrief("quote"));
  it("is a 1080x1350 scene", () => {
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
  });
  it("has a quote slot holding the headline copy", () => {
    const q = scene.elements.find((e) => e.slot === "quote");
    expect(q).toBeTruthy();
    expect(q && "content" in q ? q.content : "").toContain("Stop guessing");
  });
  it("has an attribution subhead slot", () => {
    const slots = scene.elements.map((e) => e.slot).filter(Boolean);
    expect(slots).toContain("subhead");
  });
  it("renders the big quotation mark in the accent color", () => {
    const mark = scene.elements.find((e) => e.id === "quoteMark");
    expect(mark && "color" in mark ? mark.color : "").toBe("#ff3366");
  });
  it("keeps every element within bounds", () => {
    for (const el of scene.elements) expect(withinBounds(el)).toBe(true);
  });
});
