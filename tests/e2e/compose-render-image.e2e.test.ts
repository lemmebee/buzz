// Real end-to-end integration for the PHOTO render path:
// archetype builder -> Scene with a local /api/media image -> inline -> Satori -> resvg -> PNG.
// satori 0.26 cannot load /api/media relative paths; the renderer must inline images as data: URIs
// BEFORE calling satori. This test FAILS before Fix A/B and PASSES after.
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
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

const kit = coldStartBrandKit(
  normalizeProfile({
    name: "Camber Coffee",
    visualIdentity: { style: "editorial serif", colors: "cream and clay", mood: "calm, crafted" },
  })
);

// A photo brief whose imagery.scene points at a real on-disk file under /api/media/.
function photoBriefFor(id: "displayImage" | "photoCaption", src: string): Brief {
  return {
    archetype: id,
    headline: "Brew like a barista at home",
    subhead: "Single-origin beans, roasted weekly",
    body: "",
    imagery: { kind: "photo", scene: src },
    accentIndex: 0,
    caption: "caption text",
    hashtags: ["coffee", "pourover"],
  };
}

describe("e2e: photo render path inlines local images and renders a real PNG", () => {
  let mediaSrc: string;

  beforeAll(async () => {
    // Write a small real JPEG into public/media and reference it via /api/media/.
    const mediaDir = join(process.cwd(), "public", "media");
    mkdirSync(mediaDir, { recursive: true });
    const filename = `test-photo-${Date.now()}.jpg`;
    const jpg = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 180, g: 120, b: 60 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    writeFileSync(join(mediaDir, filename), jpg);
    mediaSrc = `/api/media/${filename}`;
  });

  it("renders displayImage with a /api/media photo background at 1080x1350", async () => {
    const renderer = createSatoriResvgRenderer();
    const display = await resolveFont(kit.type.display.family, kit.type.display.class, kit.type.display.weights[0]);
    const body = await resolveFont(kit.type.body.family, kit.type.body.class, kit.type.body.weights[0]);
    const fonts = [
      { name: display.family, data: display.data, weight: display.weight },
      { name: body.family, data: body.data, weight: body.weight },
    ];

    const scene = ARCHETYPES.displayImage(kit, photoBriefFor("displayImage", mediaSrc));
    expect(scene.background.kind).toBe("image");

    const out = await renderer.generate({ scene, fonts });
    expect(out.svg).toContain("<svg");
    expect(out.localPath).toMatch(/^\/api\/media\//);

    const fs = await import("fs");
    const path = await import("path");
    const file = path.join(process.cwd(), "public", "media", out.localPath!.replace("/api/media/", ""));
    const buf = fs.readFileSync(file);
    const { width, height } = pngSize(buf);
    expect(width).toBe(1080);
    expect(height).toBe(1350);
    expect(buf.length).toBeGreaterThan(2000);
  }, 120000);

  it("renders photoCaption with a /api/media photo IMAGE element at 1080x1350", async () => {
    const renderer = createSatoriResvgRenderer();
    const display = await resolveFont(kit.type.display.family, kit.type.display.class, kit.type.display.weights[0]);
    const body = await resolveFont(kit.type.body.family, kit.type.body.class, kit.type.body.weights[0]);
    const fonts = [
      { name: display.family, data: display.data, weight: display.weight },
      { name: body.family, data: body.data, weight: body.weight },
    ];

    const scene = ARCHETYPES.photoCaption(kit, photoBriefFor("photoCaption", mediaSrc));
    // photoCaption places the photo in an IMAGE element (slot:"bg"), not the background.
    const photoEl = scene.elements.find((e) => e.type === "image");
    expect(photoEl).toBeTruthy();
    expect((photoEl as { src: string }).src).toBe(mediaSrc);

    const out = await renderer.generate({ scene, fonts });
    expect(out.svg).toContain("<svg");

    const fs = await import("fs");
    const path = await import("path");
    const file = path.join(process.cwd(), "public", "media", out.localPath!.replace("/api/media/", ""));
    const buf = fs.readFileSync(file);
    const { width, height } = pngSize(buf);
    expect(width).toBe(1080);
    expect(height).toBe(1350);
    expect(buf.length).toBeGreaterThan(2000);
  }, 120000);
});
