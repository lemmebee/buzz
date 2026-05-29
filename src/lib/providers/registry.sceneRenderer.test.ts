import { describe, it, expect } from "vitest";
import {
  registerSceneRenderer,
  getSceneRenderer,
  hasSceneRenderer,
} from "@/lib/providers/registry";
import type { SceneRenderer } from "@/lib/providers/types";

const stub: SceneRenderer = {
  name: "stub/renderer",
  async generate() {
    return { url: "/api/media/x.png", localPath: "/api/media/x.png" };
  },
};

describe("scene-renderer registry slot", () => {
  it("has=false before registration and throws on get", () => {
    // fresh module state per test file; nothing registered yet
    expect(hasSceneRenderer()).toBe(false);
    expect(() => getSceneRenderer()).toThrow(/No scene renderer registered/);
  });

  it("has=true and returns the provider after registration", () => {
    registerSceneRenderer(stub);
    expect(hasSceneRenderer()).toBe(true);
    expect(getSceneRenderer()).toBe(stub);
    expect(getSceneRenderer().name).toBe("stub/renderer");
  });
});
