import { describe, it, expect } from "vitest";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import { moveElement, resizeElement, setText, swapImage, findElement } from "@/lib/compose/edit";

function baseScene(): Scene {
  const els: SceneElement[] = [
    { id: "h1", type: "text", x: 100, y: 100, w: 400, h: 80, rotation: 0, z: 1, slot: "headline", content: "Hi", fontFamily: "Inter", fontWeight: 700, size: 48, color: "#000", align: "left", lineHeight: 1.1 },
    { id: "img1", type: "image", x: 0, y: 0, w: 1080, h: 600, rotation: 0, z: 0, slot: "bg", src: "/api/media/a.png", fit: "cover" },
  ];
  return { w: 1080, h: 1350, background: { kind: "solid", color: "#fff" }, elements: els };
}

describe("scene edit helpers", () => {
  it("findElement returns the matching element or undefined", () => {
    expect(findElement(baseScene(), "h1")?.type).toBe("text");
    expect(findElement(baseScene(), "nope")).toBeUndefined();
  });

  it("moveElement updates x/y and is immutable", () => {
    const s = baseScene();
    const next = moveElement(s, "h1", 250, 300);
    expect(findElement(next, "h1")).toMatchObject({ x: 250, y: 300 });
    expect(findElement(s, "h1")).toMatchObject({ x: 100, y: 100 }); // original untouched
    expect(next).not.toBe(s);
    expect(next.elements).not.toBe(s.elements);
  });

  it("moveElement clamps inside the scene bounds", () => {
    const next = moveElement(baseScene(), "h1", -50, 2000);
    // x clamped to >=0, y clamped so element stays within SCENE_H
    expect(findElement(next, "h1")!.x).toBe(0);
    expect(findElement(next, "h1")!.y).toBe(1350 - 80);
  });

  it("resizeElement enforces a minimum size and clamps to bounds", () => {
    const next = resizeElement(baseScene(), "h1", 5, 5);
    const el = findElement(next, "h1")!;
    expect(el.w).toBeGreaterThanOrEqual(8);
    expect(el.h).toBeGreaterThanOrEqual(8);
    const big = resizeElement(baseScene(), "h1", 5000, 5000);
    expect(findElement(big, "h1")!.w).toBe(1080 - 100); // clamped to right edge from x=100
    expect(findElement(big, "h1")!.h).toBe(1350 - 100);
  });

  it("setText updates text-bearing content fields", () => {
    const t = setText(baseScene(), "h1", "Hello world");
    expect(findElement(t, "h1")).toMatchObject({ content: "Hello world" });
  });

  it("setText throws for non-text elements", () => {
    expect(() => setText(baseScene(), "img1", "x")).toThrow();
  });

  it("swapImage updates src of an image element", () => {
    const s2 = swapImage(baseScene(), "img1", "/api/media/b.png");
    expect(findElement(s2, "img1")).toMatchObject({ src: "/api/media/b.png" });
  });

  it("swapImage throws for non-image elements", () => {
    expect(() => swapImage(baseScene(), "h1", "/x.png")).toThrow();
  });

  it("unknown id throws", () => {
    expect(() => moveElement(baseScene(), "ghost", 0, 0)).toThrow();
  });
});
