import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { SCENE_W, SCENE_H, type Scene } from "@/lib/compose/scene";

function loadInter(weight: 400 | 700): Buffer {
  const file = weight === 700 ? "inter-latin-700-normal.woff" : "inter-latin-400-normal.woff";
  return readFileSync(join(process.cwd(), "node_modules/@fontsource/inter/files", file));
}

// PNG IHDR: bytes 16-19 = width, 20-23 = height (big-endian uint32)
function pngDims(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("satori+resvg fidelity spike", () => {
  it("renders a 3-element scene to a 1080x1350 PNG with real text", async () => {
    const scene: Scene = {
      w: SCENE_W,
      h: SCENE_H,
      background: { kind: "gradient", from: "#0B1020", to: "#1E3A8A", angle: 135 },
      elements: [
        { id: "h", type: "text", x: 80, y: 200, w: 920, h: 300, rotation: 0, z: 1, slot: "headline",
          content: "Ship faster", fontFamily: "Inter", fontWeight: 700, size: 96, color: "#FFFFFF", align: "left", lineHeight: 1.05 },
        { id: "s", type: "text", x: 80, y: 540, w: 920, h: 200, rotation: 0, z: 1, slot: "subhead",
          content: "A composable scene renderer", fontFamily: "Inter", fontWeight: 400, size: 44, color: "#CBD5E1", align: "left", lineHeight: 1.2 },
        { id: "box", type: "shape", x: 80, y: 1100, w: 360, h: 120, rotation: 0, z: 0, shape: "rect",
          fill: "#F59E0B", radius: 24 },
      ],
    };

    const tree = sceneToSatori(scene);
    const svg = await satori(tree as Parameters<typeof satori>[0], {
      width: SCENE_W,
      height: SCENE_H,
      fonts: [
        { name: "Inter", data: loadInter(400), weight: 400, style: "normal" },
        { name: "Inter", data: loadInter(700), weight: 700, style: "normal" },
      ],
    });

    expect(svg).toContain("<svg");

    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: false },
      fitTo: { mode: "width", value: SCENE_W },
    });
    const png = resvg.render().asPng();

    const { width, height } = pngDims(png);
    expect(width).toBe(SCENE_W);
    expect(height).toBe(SCENE_H);
    // Non-trivial: a real rasterized scene is far larger than an empty canvas
    expect(png.length).toBeGreaterThan(5000);
  });
});
