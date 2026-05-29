import { describe, it, expect } from "vitest";
import { applyDrag, applyResize } from "@/components/editor/useDragResize";

const start = { x: 100, y: 200, w: 300, h: 150 };

describe("drag/resize delta math (scene coords)", () => {
  it("applyDrag adds scaled pointer delta to start position", () => {
    // pointer moved 50px right, 20px down on screen; canvas scale 0.5 => scene delta 100/40
    const next = applyDrag(start, { dx: 50, dy: 20 }, 0.5);
    expect(next).toMatchObject({ x: 200, y: 240 });
  });

  it("applyResize grows w/h by scaled delta", () => {
    const next = applyResize(start, { dx: 50, dy: 20 }, 0.5);
    expect(next).toMatchObject({ w: 400, h: 190 });
  });

  it("applyResize never goes below the minimum", () => {
    const next = applyResize(start, { dx: -10000, dy: -10000 }, 1);
    expect(next.w).toBeGreaterThanOrEqual(8);
    expect(next.h).toBeGreaterThanOrEqual(8);
  });
});
