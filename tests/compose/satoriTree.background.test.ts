import { describe, it, expect } from "vitest";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { makeScene, SCENE_W, SCENE_H } from "@/lib/compose/scene";

describe("sceneToSatori background", () => {
  it("produces a root div sized to the scene with relative positioning", () => {
    const node = sceneToSatori(makeScene([], { kind: "solid", color: "#101010" }));
    expect(node.type).toBe("div");
    const style = node.props.style as Record<string, unknown>;
    expect(style.position).toBe("relative");
    expect(style.display).toBe("flex");
    expect(style.width).toBe(SCENE_W);
    expect(style.height).toBe(SCENE_H);
    expect(style.overflow).toBe("hidden");
    expect(style.backgroundColor).toBe("#101010");
    expect(Array.isArray(node.props.children)).toBe(true);
  });

  it("maps gradient background to a linear-gradient backgroundImage", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "gradient", from: "#ff0000", to: "#0000ff", angle: 45 })
    );
    const style = node.props.style as Record<string, unknown>;
    expect(style.backgroundImage).toBe("linear-gradient(45deg, #ff0000, #0000ff)");
    expect(style.backgroundColor).toBeUndefined();
  });

  it("maps image background to an absolutely positioned img child filling the canvas", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "image", src: "/api/media/bg.png", fit: "cover" })
    );
    const children = node.props.children as Array<{ type: string; props: Record<string, unknown> }>;
    const bgImg = children[0];
    expect(bgImg.type).toBe("img");
    expect(bgImg.props.src).toBe("/api/media/bg.png");
    const s = bgImg.props.style as Record<string, unknown>;
    expect(s.position).toBe("absolute");
    expect(s.top).toBe(0);
    expect(s.left).toBe(0);
    expect(s.width).toBe(SCENE_W);
    expect(s.height).toBe(SCENE_H);
    expect(s.objectFit).toBe("cover");
  });

  it("applies a warm overlay for image treatment 'warm'", () => {
    const node = sceneToSatori(
      makeScene([], { kind: "image", src: "/api/media/bg.png", fit: "cover", treatment: "warm" })
    );
    const children = node.props.children as Array<{ type: string; props: Record<string, unknown> }>;
    // [0] = img, [1] = warm overlay div
    const overlay = children[1];
    expect(overlay.type).toBe("div");
    const s = overlay.props.style as Record<string, unknown>;
    expect(s.position).toBe("absolute");
    expect(typeof s.backgroundColor).toBe("string");
    expect(s.width).toBe(SCENE_W);
    expect(s.height).toBe(SCENE_H);
  });
});
