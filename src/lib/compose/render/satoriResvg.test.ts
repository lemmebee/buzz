import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createSatoriResvgRenderer } from "@/lib/compose/render/satoriResvg";
import { SCENE_W, SCENE_H, type Scene } from "@/lib/compose/scene";

function loadInter(weight: 400 | 700): Buffer {
  const file = weight === 700 ? "inter-latin-700-normal.woff" : "inter-latin-400-normal.woff";
  return readFileSync(join(process.cwd(), "node_modules/@fontsource/inter/files", file));
}

function pngDims(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const sampleScene: Scene = {
  w: SCENE_W,
  h: SCENE_H,
  background: { kind: "solid", color: "#101418" },
  elements: [
    { id: "h", type: "text", x: 80, y: 240, w: 920, h: 280, rotation: 0, z: 1, slot: "headline",
      content: "Render smoke", fontFamily: "Inter", fontWeight: 700, size: 88, color: "#FFFFFF", align: "left", lineHeight: 1.05 },
    { id: "b", type: "text", x: 80, y: 560, w: 920, h: 200, rotation: 0, z: 1, slot: "body",
      content: "Satori then resvg to a PNG.", fontFamily: "Inter", fontWeight: 400, size: 40, color: "#9CA3AF", align: "left", lineHeight: 1.3 },
  ],
};

describe("createSatoriResvgRenderer", () => {
  it("renders a scene to a 1080x1350 png saved under public/media", async () => {
    const renderer = createSatoriResvgRenderer();
    expect(renderer.name).toContain("satori");

    const out = await renderer.generate({
      scene: sampleScene,
      fonts: [
        { name: "Inter", data: loadInter(400), weight: 400, style: "normal" },
        { name: "Inter", data: loadInter(700), weight: 700, style: "normal" },
      ],
    });

    expect(out.localPath).toMatch(/^\/api\/media\/render-\d+\.png$/);
    expect(out.url).toBe(out.localPath);
    expect(out.svg).toContain("<svg");

    const filename = out.localPath!.replace("/api/media/", "");
    const diskPath = join(process.cwd(), "public", "media", filename);
    expect(existsSync(diskPath)).toBe(true);

    const png = readFileSync(diskPath);
    const { width, height } = pngDims(png);
    expect(width).toBe(SCENE_W);
    expect(height).toBe(SCENE_H);
    expect(png.length).toBeGreaterThan(5000);
  });

  it("throws a clear error when no fonts are provided", async () => {
    const renderer = createSatoriResvgRenderer();
    await expect(
      renderer.generate({ scene: sampleScene, fonts: [] })
    ).rejects.toThrow(/at least one font/i);
  });
});
