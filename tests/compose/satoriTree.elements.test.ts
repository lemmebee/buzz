import { describe, it, expect } from "vitest";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { makeScene, makeText, makeImage } from "@/lib/compose/scene";
import type {
  TextElement,
  ImageElement,
  ShapeElement,
  PillElement,
  ButtonElement,
  LogoElement,
  IconElement,
  ChatBubbleElement,
  StatBlockElement,
} from "@/lib/compose/scene";

type Node = { type: string; props: Record<string, unknown> };
const styleOf = (n: Node) => n.props.style as Record<string, unknown>;

describe("sceneToSatori element mapping", () => {
  it("renders a 2-element scene as ordered children by z, after bg layers", () => {
    const img = makeImage({
      id: "bg",
      src: "/api/media/p.png",
      x: 0,
      y: 0,
      w: 1080,
      h: 1350,
      z: 0,
      slot: "bg",
    });
    const head = makeText({
      id: "h",
      content: "Big News",
      size: 72,
      x: 80,
      y: 120,
      w: 920,
      h: 200,
      fontFamily: "Inter",
      fontWeight: 800,
      color: "#ffffff",
      align: "center",
      lineHeight: 1.1,
      z: 1,
      slot: "headline",
    });
    // intentionally out of z-order to prove sorting
    const root = sceneToSatori(makeScene([head, img], { kind: "solid", color: "#000" }));
    const children = root.props.children as Node[];
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("img"); // z=0
    expect(children[1].type).toBe("div"); // text wrapper z=1
    expect(children[0].props.src).toBe("/api/media/p.png");
  });

  it("maps a text element to an absolutely positioned flex div with wrapping", () => {
    const t: TextElement = makeText({
      id: "h",
      content: "Hello\nWorld",
      size: 64,
      x: 40,
      y: 50,
      w: 600,
      h: 180,
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#222",
      align: "center",
      lineHeight: 1.3,
      rotation: -3,
    });
    const root = sceneToSatori(makeScene([t]));
    const node = (root.props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.left).toBe(40);
    expect(s.top).toBe(50);
    expect(s.width).toBe(600);
    expect(s.height).toBe(180);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    expect(s.fontFamily).toBe("Inter");
    expect(s.fontWeight).toBe(700);
    expect(s.fontSize).toBe(64);
    expect(s.color).toBe("#222");
    expect(s.lineHeight).toBe(1.3);
    expect(s.textAlign).toBe("center");
    expect(s.alignItems).toBe("center"); // center maps to center
    expect(s.whiteSpace).toBe("pre-wrap");
    expect(s.transform).toBe("rotate(-3deg)");
    expect(node.props.children).toBe("Hello\nWorld");
  });

  it("maps text align left/right to flex alignItems flex-start/flex-end", () => {
    const left = sceneToSatori(makeScene([makeText({ id: "a", content: "x", size: 20, align: "left" })]));
    const right = sceneToSatori(makeScene([makeText({ id: "b", content: "y", size: 20, align: "right" })]));
    expect(styleOf((left.props.children as Node[])[0]).alignItems).toBe("flex-start");
    expect(styleOf((right.props.children as Node[])[0]).alignItems).toBe("flex-end");
  });

  it("maps a foreground image element to an img with objectFit + radius", () => {
    const img: ImageElement = {
      type: "image",
      id: "pic",
      src: "/api/media/q.png",
      fit: "contain",
      radius: 24,
      x: 100,
      y: 200,
      w: 400,
      h: 300,
      rotation: 0,
      z: 2,
    };
    const root = sceneToSatori(makeScene([img]));
    const node = (root.props.children as Node[])[0];
    expect(node.type).toBe("img");
    expect(node.props.src).toBe("/api/media/q.png");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.left).toBe(100);
    expect(s.top).toBe(200);
    expect(s.width).toBe(400);
    expect(s.height).toBe(300);
    expect(s.objectFit).toBe("contain");
    expect(s.borderRadius).toBe(24);
  });

  it("maps a rect shape to a div with fill/border/radius", () => {
    const rect: ShapeElement = {
      type: "shape",
      shape: "rect",
      id: "r",
      fill: "#eee",
      stroke: "#333",
      strokeWidth: 4,
      radius: 12,
      x: 10,
      y: 10,
      w: 200,
      h: 80,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([rect])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.backgroundColor).toBe("#eee");
    expect(s.borderRadius).toBe(12);
    expect(s.border).toBe("4px solid #333");
  });

  it("maps a line shape to a thin div using strokeWidth as height", () => {
    const line: ShapeElement = {
      type: "shape",
      shape: "line",
      id: "ln",
      stroke: "#000",
      strokeWidth: 6,
      x: 0,
      y: 100,
      w: 500,
      h: 0,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([line])).props.children as Node[])[0];
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#000");
    expect(s.height).toBe(6);
    expect(s.width).toBe(500);
  });

  it("maps a pill to a rounded flex div with text child", () => {
    const pill: PillElement = {
      type: "pill",
      id: "p",
      text: "NEW",
      bg: "#ff0",
      color: "#000",
      fontFamily: "Inter",
      size: 28,
      x: 20,
      y: 20,
      w: 120,
      h: 48,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([pill])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.display).toBe("flex");
    expect(s.alignItems).toBe("center");
    expect(s.justifyContent).toBe("center");
    expect(s.backgroundColor).toBe("#ff0");
    expect(s.color).toBe("#000");
    expect(s.fontFamily).toBe("Inter");
    expect(s.fontSize).toBe(28);
    expect(s.borderRadius).toBe(24); // h/2
    expect(node.props.children).toBe("NEW");
  });

  it("maps a button to a rounded flex div using its radius", () => {
    const btn: ButtonElement = {
      type: "button",
      id: "b",
      label: "Buy now",
      bg: "#0a0",
      color: "#fff",
      fontFamily: "Inter",
      size: 32,
      radius: 16,
      x: 50,
      y: 900,
      w: 300,
      h: 90,
      rotation: 0,
      z: 3,
    };
    const node = (sceneToSatori(makeScene([btn])).props.children as Node[])[0];
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#0a0");
    expect(s.color).toBe("#fff");
    expect(s.fontSize).toBe(32);
    expect(s.borderRadius).toBe(16);
    expect(s.justifyContent).toBe("center");
    expect(node.props.children).toBe("Buy now");
  });

  it("maps a logo to an img", () => {
    const logo: LogoElement = {
      type: "logo",
      id: "lg",
      src: "/api/media/logo.svg",
      x: 40,
      y: 40,
      w: 160,
      h: 60,
      rotation: 0,
      z: 5,
    };
    const node = (sceneToSatori(makeScene([logo])).props.children as Node[])[0];
    expect(node.type).toBe("img");
    expect(node.props.src).toBe("/api/media/logo.svg");
    const s = styleOf(node);
    expect(s.width).toBe(160);
    expect(s.height).toBe(60);
    expect(s.objectFit).toBe("contain");
  });

  it("maps an icon to a div placeholder carrying its name + color", () => {
    const icon: IconElement = {
      type: "icon",
      id: "ic",
      name: "star",
      stroke: "#f0f",
      strokeWidth: 2,
      iconStyle: "line",
      x: 10,
      y: 10,
      w: 48,
      h: 48,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([icon])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.position).toBe("absolute");
    expect(s.width).toBe(48);
    expect(s.height).toBe(48);
    expect(s.color).toBe("#f0f");
    expect((node.props as Record<string, unknown>)["data-icon"]).toBe("star");
  });

  it("maps a chatBubble to a flex div with text + side-based borderRadius", () => {
    const bubble: ChatBubbleElement = {
      type: "chatBubble",
      id: "cb",
      text: "Hi there",
      side: "left",
      bg: "#eaeaea",
      color: "#111",
      fontFamily: "Inter",
      size: 30,
      x: 60,
      y: 400,
      w: 500,
      h: 120,
      rotation: 0,
      z: 2,
    };
    const node = (sceneToSatori(makeScene([bubble])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.backgroundColor).toBe("#eaeaea");
    expect(s.color).toBe("#111");
    expect(s.fontSize).toBe(30);
    expect(s.display).toBe("flex");
    expect(typeof s.borderRadius).toBe("string");
    expect(node.props.children).toBe("Hi there");
  });

  it("maps a statBlock to a column flex div with value + label children", () => {
    const stat: StatBlockElement = {
      type: "statBlock",
      id: "st",
      value: "92%",
      label: "satisfaction",
      valueColor: "#000",
      labelColor: "#888",
      fontFamily: "Inter",
      valueSize: 96,
      labelSize: 28,
      x: 100,
      y: 600,
      w: 400,
      h: 200,
      rotation: 0,
      z: 1,
    };
    const node = (sceneToSatori(makeScene([stat])).props.children as Node[])[0];
    expect(node.type).toBe("div");
    const s = styleOf(node);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    const kids = node.props.children as Node[];
    expect(kids).toHaveLength(2);
    expect(kids[0].props.children).toBe("92%");
    expect((kids[0].props.style as Record<string, unknown>).fontSize).toBe(96);
    expect((kids[0].props.style as Record<string, unknown>).color).toBe("#000");
    expect(kids[1].props.children).toBe("satisfaction");
    expect((kids[1].props.style as Record<string, unknown>).fontSize).toBe(28);
    expect((kids[1].props.style as Record<string, unknown>).color).toBe("#888");
  });
});
