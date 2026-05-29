import { describe, it, expect } from "vitest";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import {
  pickAccent, marginFor, gapFor, withinBounds, baseBackground,
} from "@/lib/compose/archetypes/_shared";
import type { BrandKit } from "@/lib/brain/brandkit";

const kit: BrandKit = {
  palette: { bg: "#0b0b0b", surface: "#161616", ink: "#ffffff", muted: "#9a9a9a", accents: ["#ff3366", "#33ccff"], onAccent: "#000000" },
  type: {
    display: { family: "Fraunces", class: "display", source: "fontsource", weights: [700] },
    body: { family: "Inter", class: "sans", source: "fontsource", weights: [400, 600] },
  },
  logo: {},
  icons: { style: "line" },
  shape: { radius: 24, density: "balanced" },
  photo: { treatment: "none" },
  mood: ["bold"],
  source: { from: "derived", at: 0 },
};

describe("_shared helpers", () => {
  it("pickAccent wraps the accent index", () => {
    expect(pickAccent(kit, 0)).toBe("#ff3366");
    expect(pickAccent(kit, 1)).toBe("#33ccff");
    expect(pickAccent(kit, 3)).toBe("#33ccff"); // 3 % 2 === 1
  });
  it("marginFor scales with density", () => {
    expect(marginFor("airy")).toBeGreaterThan(marginFor("balanced"));
    expect(marginFor("balanced")).toBeGreaterThan(marginFor("tight"));
  });
  it("gapFor scales with density", () => {
    expect(gapFor("airy")).toBeGreaterThan(gapFor("tight"));
  });
  it("withinBounds detects out-of-canvas elements", () => {
    expect(withinBounds({ x: 0, y: 0, w: SCENE_W, h: SCENE_H })).toBe(true);
    expect(withinBounds({ x: 100, y: 100, w: 200, h: 200 })).toBe(true);
    expect(withinBounds({ x: -1, y: 0, w: 10, h: 10 })).toBe(false);
    expect(withinBounds({ x: 0, y: 0, w: SCENE_W + 1, h: 10 })).toBe(false);
  });
  it("baseBackground returns solid/gradient/image per imagery.kind", () => {
    expect(baseBackground(kit, { kind: "solid" }, "#ff3366").kind).toBe("solid");
    expect(baseBackground(kit, { kind: "gradient" }, "#ff3366").kind).toBe("gradient");
    const img = baseBackground(kit, { kind: "photo", scene: "/x.png" }, "#ff3366");
    expect(img.kind).toBe("image");
  });
});
