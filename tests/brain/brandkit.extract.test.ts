import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  extractCssHexColors,
  extractLogoCandidates,
  extractFontFamilies,
  extractOgImage,
} from "@/lib/brain/brandkit";

const html = readFileSync(join(__dirname, "../fixtures/sample-site.html"), "utf-8");
const baseUrl = "https://acme.test";

describe("extractCssHexColors", () => {
  it("pulls hex values from inline CSS custom properties + rules", () => {
    const hexes = extractCssHexColors(html);
    expect(hexes).toContain("#0B0F1A");
    expect(hexes).toContain("#FF5A36");
    expect(hexes).toContain("#36C2FF");
    expect(hexes).toContain("#F5F7FF");
  });
  it("dedupes and uppercases", () => {
    const hexes = extractCssHexColors(html);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(hexes.every((h) => h === h.toUpperCase())).toBe(true);
  });
});

describe("extractLogoCandidates", () => {
  it("returns absolute URLs for og:image, icon, apple-touch-icon, and inline logo img", () => {
    const c = extractLogoCandidates(html, baseUrl);
    expect(c).toContain("https://cdn.example.com/og-cover.png");
    expect(c).toContain("https://acme.test/favicon-32.png");
    expect(c).toContain("https://acme.test/apple-touch-icon.png");
    expect(c).toContain("https://acme.test/logo.svg");
  });
});

describe("extractOgImage", () => {
  it("returns the og:image absolute URL", () => {
    expect(extractOgImage(html, baseUrl)).toBe("https://cdn.example.com/og-cover.png");
  });
});

describe("extractFontFamilies", () => {
  it("reads display font from heading rules and body font from body rule", () => {
    const fonts = extractFontFamilies(html);
    expect(fonts.display).toBe("Sora");
    expect(fonts.body).toBe("Inter");
  });
  it("includes google-fonts families and @font-face families", () => {
    const fonts = extractFontFamilies(html);
    expect(fonts.googleFonts).toContain("Sora");
    expect(fonts.googleFonts).toContain("Inter");
    expect(fonts.fontFace).toContain("Sora");
  });
});
