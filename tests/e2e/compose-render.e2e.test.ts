// Real end-to-end integration: archetype builder -> Scene -> Satori -> resvg -> PNG.
// No mocks. Exercises B (scene/satoriTree) + C (fonts) + D-types (BrandKit) + F (renderer) + G (archetypes) together.
import { describe, it, expect } from "vitest";
import { ARCHETYPES } from "@/lib/compose/archetypes";
import type { Brief } from "@/lib/compose/archetypes";
import { resolveFont } from "@/lib/compose/fonts";
import { createSatoriResvgRenderer } from "@/lib/compose/render/satoriResvg";
import { coldStartBrandKit } from "@/lib/brain/brandkit";
import { normalizeProfile } from "@/lib/brain/types";

// Parse width/height from a PNG IHDR chunk (big-endian uint32 at byte 16 and 20).
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const ARCHETYPE_IDS = [
  "editorial", "displayImage", "photoCaption", "iconCard", "quote",
  "stat", "steps", "feature", "announce", "article",
] as const;

function briefFor(id: (typeof ARCHETYPE_IDS)[number]): Brief {
  return {
    archetype: id,
    headline: "Brew like a barista at home",
    subhead: "Single-origin beans, roasted weekly",
    body: "Step one: grind fresh.\nStep two: bloom 30s.\nStep three: pour slow.",
    imagery: { kind: "solid" },
    accentIndex: 0,
    caption: "caption text",
    hashtags: ["coffee", "pourover"],
  };
}

describe("e2e: compose + render every archetype to a real PNG", () => {
  const kit = coldStartBrandKit(
    normalizeProfile({
      name: "Camber Coffee",
      visualIdentity: { style: "editorial serif", colors: "cream and clay", mood: "calm, crafted" },
    })
  );

  it("resolves brand fonts and renders all 10 archetypes at 1080x1350", async () => {
    const renderer = createSatoriResvgRenderer();
    const display = await resolveFont(kit.type.display.family, kit.type.display.class, kit.type.display.weights[0]);
    const body = await resolveFont(kit.type.body.family, kit.type.body.class, kit.type.body.weights[0]);
    const fonts = [
      { name: display.family, data: display.data, weight: display.weight },
      { name: body.family, data: body.data, weight: body.weight },
    ];

    for (const id of ARCHETYPE_IDS) {
      const scene = ARCHETYPES[id](kit, briefFor(id));
      expect(scene.w).toBe(1080);
      expect(scene.h).toBe(1350);

      const out = await renderer.generate({ scene, fonts });
      expect(out.svg).toContain("<svg");
      expect(out.localPath).toMatch(/^\/api\/media\//);

      // The output PNG must be a real 1080x1350 image.
      const fs = await import("fs");
      const path = await import("path");
      const file = path.join(process.cwd(), "public", "media", out.localPath!.replace("/api/media/", ""));
      const buf = fs.readFileSync(file);
      const { width, height } = pngSize(buf);
      expect(width).toBe(1080);
      expect(height).toBe(1350);
      expect(buf.length).toBeGreaterThan(2000);
    }
  }, 120000);
});
