import { describe, it, expect } from "vitest";
import { buildPalette, relativeLuminance, buildFontSpecs } from "@/lib/brain/brandkit";

describe("relativeLuminance", () => {
  it("white is brighter than black", () => {
    expect(relativeLuminance("#FFFFFF")).toBeGreaterThan(relativeLuminance("#000000"));
  });
});

describe("buildPalette", () => {
  it("assigns darkest as bg, lightest as ink, vivid as accent", () => {
    const p = buildPalette(["#0B0F1A", "#F5F7FF", "#161B2E", "#9AA3B2", "#FF5A36", "#36C2FF"]);
    expect(relativeLuminance(p!.bg)).toBeLessThan(relativeLuminance(p!.ink));
    expect(p!.accents.length).toBeGreaterThan(0);
    expect(p!.onAccent === "#FFFFFF" || p!.onAccent === "#0B0F1A").toBe(true);
  });
  it("returns a usable palette even from a single color", () => {
    const p = buildPalette(["#FF5A36"]);
    expect(p!.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(p!.ink).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(p!.accents[0]).toBe("#FF5A36");
  });
  it("returns null when given no colors", () => {
    expect(buildPalette([])).toBeNull();
  });
});

describe("buildFontSpecs", () => {
  it("marks site-sourced when family came from CSS, google when from google link", () => {
    const specs = buildFontSpecs({ display: "Sora", body: "Inter", googleFonts: ["Sora"], fontFace: ["Sora"] });
    expect(specs.display.family).toBe("Sora");
    expect(specs.display.source).toBe("site");
    expect(specs.body.family).toBe("Inter");
    expect(specs.display.class).toBe("display");
    expect(specs.body.class).toBe("sans");
  });
  it("falls back to substitute defaults when no fonts found", () => {
    const specs = buildFontSpecs({ googleFonts: [], fontFace: [] });
    expect(specs.display.source).toBe("substitute");
    expect(specs.body.source).toBe("substitute");
  });
});
