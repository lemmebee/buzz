import { describe, it, expect } from "vitest";
import { createSceneRenderer } from "@/lib/providers/factory";

describe("createSceneRenderer factory", () => {
  it("defaults to the satori/resvg renderer", () => {
    const r = createSceneRenderer();
    expect(r.name).toBe("satori/resvg");
    expect(typeof r.generate).toBe("function");
  });

  it("resolves 'satori' by explicit name", () => {
    expect(createSceneRenderer("satori").name).toBe("satori/resvg");
  });

  it("throws on unknown renderer name", () => {
    expect(() => createSceneRenderer("nope")).toThrow(/Unknown SCENE_RENDERER/);
  });
});
