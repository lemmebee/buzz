import { describe, it, expect } from "vitest";
import { ARCHETYPES, ARCHETYPE_IDS } from "@/lib/compose/archetypes";

const EXPECTED: string[] = [
  "editorial", "displayImage", "photoCaption", "iconCard", "quote",
  "stat", "steps", "feature", "announce", "article",
];

describe("ARCHETYPES barrel", () => {
  it("exposes the 10 archetype ids", () => {
    expect([...ARCHETYPE_IDS].sort()).toEqual([...EXPECTED].sort());
  });
  it("registers a builder fn for every id", () => {
    for (const id of ARCHETYPE_IDS) {
      expect(typeof ARCHETYPES[id]).toBe("function");
    }
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...EXPECTED].sort());
  });
});
