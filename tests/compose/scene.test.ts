import { describe, it, expect } from "vitest";
import {
  SCENE_W,
  SCENE_H,
  makeText,
  makeImage,
  makeScene,
  type Scene,
  type TextElement,
} from "@/lib/compose/scene";

describe("scene model", () => {
  it("exposes canvas dimensions", () => {
    expect(SCENE_W).toBe(1080);
    expect(SCENE_H).toBe(1350);
  });

  it("makeText builds a text element with defaults", () => {
    const t = makeText({ id: "h1", content: "Hello", size: 64 });
    expect(t.type).toBe("text");
    expect(t.id).toBe("h1");
    expect(t.content).toBe("Hello");
    expect(t.size).toBe(64);
    expect(t.fontFamily).toBe("sans-serif");
    expect(t.fontWeight).toBe(400);
    expect(t.color).toBe("#000000");
    expect(t.align).toBe("left");
    expect(t.lineHeight).toBe(1.2);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    expect(t.w).toBe(SCENE_W);
    expect(t.h).toBe(0);
    expect(t.rotation).toBe(0);
    expect(t.z).toBe(0);
  });

  it("makeText honors overrides incl slot", () => {
    const t = makeText({
      id: "h1",
      content: "Hi",
      size: 40,
      x: 10,
      y: 20,
      w: 500,
      h: 80,
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#fff",
      align: "center",
      lineHeight: 1.4,
      slot: "headline",
      z: 5,
      rotation: -2,
    });
    expect(t).toMatchObject({
      type: "text",
      content: "Hi",
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#fff",
      align: "center",
      lineHeight: 1.4,
      slot: "headline",
      z: 5,
      rotation: -2,
      x: 10,
      y: 20,
      w: 500,
      h: 80,
    });
  });

  it("makeImage builds an image element with cover default", () => {
    const img = makeImage({ id: "bg", src: "/api/media/x.png", w: SCENE_W, h: SCENE_H });
    expect(img.type).toBe("image");
    expect(img.src).toBe("/api/media/x.png");
    expect(img.fit).toBe("cover");
    expect(img.w).toBe(SCENE_W);
    expect(img.h).toBe(SCENE_H);
  });

  it("makeScene wraps elements with canvas size + default solid bg", () => {
    const scene = makeScene([makeText({ id: "h", content: "A", size: 50 })]);
    expect(scene.w).toBe(SCENE_W);
    expect(scene.h).toBe(SCENE_H);
    expect(scene.background).toEqual({ kind: "solid", color: "#ffffff" });
    expect(scene.elements).toHaveLength(1);
  });

  it("makeScene accepts a custom background", () => {
    const bg = { kind: "gradient", from: "#000", to: "#fff", angle: 90 } as const;
    const scene = makeScene([], bg);
    expect(scene.background).toEqual(bg);
  });

  it("round-trips a Scene through JSON without loss", () => {
    const original: Scene = makeScene(
      [
        makeText({ id: "h", content: "Headline", size: 64, slot: "headline" }),
        makeImage({ id: "bg", src: "/api/media/p.png", w: SCENE_W, h: SCENE_H, slot: "bg" }),
      ],
      { kind: "image", src: "/api/media/p.png", fit: "cover", treatment: "warm" }
    );
    const clone = JSON.parse(JSON.stringify(original)) as Scene;
    expect(clone).toEqual(original);
    const head = clone.elements[0] as TextElement;
    expect(head.content).toBe("Headline");
  });
});
