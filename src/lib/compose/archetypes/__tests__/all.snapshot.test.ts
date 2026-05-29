import { describe, it, expect } from "vitest";
import { ARCHETYPES, ARCHETYPE_IDS } from "@/lib/compose/archetypes";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import { withinBounds } from "@/lib/compose/archetypes/_shared";
import { KIT, makeBrief } from "./_fixtures";

describe("all archetypes - structural contract", () => {
  for (const id of ARCHETYPE_IDS) {
    it(`${id}: builds a valid 1080x1350 scene with in-bounds elements`, () => {
      const scene = ARCHETYPES[id](KIT, makeBrief(id));
      expect(scene.w).toBe(SCENE_W);
      expect(scene.h).toBe(SCENE_H);
      expect(scene.elements.length).toBeGreaterThan(0);
      for (const el of scene.elements) {
        expect(withinBounds(el)).toBe(true);
        expect(typeof el.id).toBe("string");
        expect(el.id.length).toBeGreaterThan(0);
      }
      // element ids are unique within a scene
      const ids = scene.elements.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it("snapshots the {count, slots} signature for all 10 archetypes", () => {
    const signature: Record<string, { count: number; slots: string[] }> = {};
    for (const id of ARCHETYPE_IDS) {
      const scene = ARCHETYPES[id](KIT, makeBrief(id));
      const slots = scene.elements
        .map((e) => e.slot)
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort();
      signature[id] = { count: scene.elements.length, slots };
    }
    expect(signature).toMatchSnapshot();
  });
});
