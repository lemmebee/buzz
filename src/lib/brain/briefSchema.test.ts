import { describe, it, expect } from "vitest";
import { briefSchema } from "./briefSchema";
import type { Brief } from "@/lib/compose/archetypes";

const valid: Brief = {
  archetype: "editorial",
  headline: "Stop guessing your numbers",
  subhead: "See cash flow in one screen",
  body: "Connect once, get a daily snapshot.",
  imagery: { kind: "photo", scene: "sunlit desk with a ceramic mug" },
  accentIndex: 0,
  caption: "the full caption text",
  hashtags: ["founders", "saas"],
};

describe("briefSchema", () => {
  it("parses a valid brief", () => {
    const parsed = briefSchema.parse(valid);
    expect(parsed.archetype).toBe("editorial");
    expect(parsed.imagery.kind).toBe("photo");
    expect(parsed.hashtags).toEqual(["founders", "saas"]);
  });

  it("parses a minimal brief without optional fields", () => {
    const minimal = {
      archetype: "stat",
      headline: "92% faster",
      imagery: { kind: "solid" },
      accentIndex: 2,
      caption: "cap",
      hashtags: [],
    };
    const parsed = briefSchema.parse(minimal);
    expect(parsed.subhead).toBeUndefined();
    expect(parsed.body).toBeUndefined();
  });

  it("rejects an unknown archetype", () => {
    expect(() => briefSchema.parse({ ...valid, archetype: "bogus" })).toThrow();
  });

  it("rejects an unknown imagery kind", () => {
    expect(() => briefSchema.parse({ ...valid, imagery: { kind: "video" } })).toThrow();
  });

  it("rejects a missing headline", () => {
    const { headline, ...rest } = valid;
    void headline;
    expect(() => briefSchema.parse(rest)).toThrow();
  });

  it("rejects a non-string hashtag", () => {
    expect(() => briefSchema.parse({ ...valid, hashtags: [1, 2] })).toThrow();
  });
});
