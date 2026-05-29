import { describe, it, expect } from "vitest";
import { selectArchetype } from "@/lib/compose/archetypes/select";
import { ARCHETYPE_IDS } from "@/lib/compose/archetypes/types";
import type { HookType } from "@/lib/brain/types";

const zero: Record<string, number> = {};

describe("selectArchetype rule-map", () => {
  it("pain -> editorial when usage is equal", () => {
    expect(selectArchetype("pain", zero)).toBe("editorial");
  });
  it("curiosity -> editorial when usage is equal", () => {
    expect(selectArchetype("curiosity", zero)).toBe("editorial");
  });
  it("desire -> displayImage when usage is equal", () => {
    expect(selectArchetype("desire", zero)).toBe("displayImage");
  });
  it("contrarian -> displayImage when usage is equal", () => {
    expect(selectArchetype("contrarian", zero)).toBe("displayImage");
  });
  it("social-proof -> quote or stat when usage is equal", () => {
    const pick = selectArchetype("social-proof", zero);
    expect(["quote", "stat"]).toContain(pick);
  });
  it("returns a valid archetype id for every hook type", () => {
    const hooks: HookType[] = ["curiosity", "pain", "desire", "social-proof", "contrarian"];
    for (const h of hooks) {
      expect(ARCHETYPE_IDS).toContain(selectArchetype(h, zero));
    }
  });
});

describe("selectArchetype least-used tiebreak", () => {
  it("avoids the rule-map pick when it is already saturated", () => {
    // pain rule-map pick is editorial; saturate editorial, leave others at 0
    const usage = { editorial: 9 };
    const pick = selectArchetype("pain", usage);
    expect(pick).not.toBe("editorial");
    expect(ARCHETYPE_IDS).toContain(pick);
  });
  it("for social-proof picks the less-used of its preferred pair", () => {
    expect(selectArchetype("social-proof", { quote: 5, stat: 0 })).toBe("stat");
    expect(selectArchetype("social-proof", { quote: 0, stat: 5 })).toBe("quote");
  });
  it("reaches non-rule-map archetypes (steps/feature/announce/iconCard/photoCaption/article) via least-used", () => {
    // saturate every rule-map preferred id; least-used among remainder must surface
    const usage = { editorial: 9, displayImage: 9, quote: 9, stat: 9 };
    const pick = selectArchetype("curiosity", usage);
    expect(["steps", "feature", "announce", "iconCard", "photoCaption", "article"]).toContain(pick);
  });
  it("keeps preferred pick when it is the least used", () => {
    const usage = { editorial: 0, displayImage: 4, quote: 4, stat: 4, steps: 4, feature: 4, announce: 4, iconCard: 4, photoCaption: 4, article: 4 };
    expect(selectArchetype("pain", usage)).toBe("editorial");
  });
});
