import { describe, it, expect, beforeAll } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveFont, FONTS_CACHE_DIR, decompressWoff2ToTtf } from "../fonts";

describe("resolveFont", () => {
  beforeAll(async () => {
    await rm(resolve(FONTS_CACHE_DIR), { recursive: true, force: true });
  });

  it("resolves a known @fontsource family to a usable WOFF/TTF buffer", async () => {
    const f = await resolveFont("Inter", "sans", 400);
    expect(f.family).toBe("Inter");
    expect(f.class).toBe("sans");
    expect(f.weight).toBe(400);
    expect(f.source).toBe("fontsource");
    expect(f.data.length).toBeGreaterThan(1000);
    // satori-compatible container: WOFF ('wOFF'), TTF (0x00010000), or OTF ('OTTO')
    const sig = f.data.toString("ascii", 0, 4);
    const isTtf = f.data.readUInt32BE(0) === 0x00010000;
    expect(sig === "wOFF" || sig === "OTTO" || isTtf).toBe(true);
    // never WOFF2 (satori cannot read it)
    expect(sig).not.toBe("wOF2");
    expect(f.filePath).toContain(FONTS_CACHE_DIR);
  });

  it("substitutes a bundled OFL font by class when family is unknown", async () => {
    const serif = await resolveFont("Totally Fake Family 9000", "serif");
    expect(serif.family).toBe("Noto Serif");
    expect(serif.source).toBe("substitute");
    expect(serif.data.length).toBeGreaterThan(1000);

    const disp = await resolveFont("Nonexistent Display", "display");
    expect(disp.family).toBe("Inter");
    expect(disp.source).toBe("substitute");

    const mono = await resolveFont("Made Up Mono", "mono");
    expect(mono.family).toBe("JetBrains Mono");
    expect(mono.source).toBe("substitute");
  });

  it("caches the resolved font (second call returns cached file fast)", async () => {
    const first = await resolveFont("Inter", "sans", 700);
    const second = await resolveFont("Inter", "sans", 700);
    expect(second.filePath).toBe(first.filePath);
    expect(second.data.equals(first.data)).toBe(true);
  });

  it("falls back to nearest available weight when exact weight missing", async () => {
    // fontsource Inter has no weight 123; resolver picks an available one, never throws
    const f = await resolveFont("Inter", "sans", 123);
    expect(f.source).toBe("fontsource");
    expect(f.data.length).toBeGreaterThan(1000);
  });
});

describe("decompressWoff2ToTtf", () => {
  it("decompresses a real woff2 buffer into a TTF (sfnt) buffer", async () => {
    // use the installed fontsource woff2 as a known-good sample
    const woff2 = await readFile(
      resolve("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
    );
    expect(woff2.toString("ascii", 0, 4)).toBe("wOF2");

    const ttf = decompressWoff2ToTtf(woff2);
    // sfnt: TrueType 0x00010000 or OpenType 'OTTO'
    const isTtf = ttf.readUInt32BE(0) === 0x00010000;
    const isOtto = ttf.toString("ascii", 0, 4) === "OTTO";
    expect(isTtf || isOtto).toBe(true);
    expect(ttf.toString("ascii", 0, 4)).not.toBe("wOF2");
    expect(ttf.length).toBeGreaterThan(woff2.length); // decompressed is larger
  });
});
