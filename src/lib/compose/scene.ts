export const SCENE_W = 1080;
export const SCENE_H = 1350;

export type Slot =
  | "headline"
  | "subhead"
  | "body"
  | "bg"
  | "logo"
  | "pill"
  | "icon"
  | "cta"
  | "stat"
  | "quote";

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: string; fit: "cover" | "contain"; treatment?: "none" | "warm" | "duotone" };

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  slot?: Slot;
  locked?: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontFamily: string;
  fontWeight: number;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  radius?: number;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rect" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface IconElement extends BaseElement {
  type: "icon";
  name: string;
  stroke: string;
  strokeWidth: number;
  iconStyle: "line" | "solid";
}

export interface PillElement extends BaseElement {
  type: "pill";
  text: string;
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
}

export interface ButtonElement extends BaseElement {
  type: "button";
  label: string;
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
  radius: number;
}

export interface LogoElement extends BaseElement {
  type: "logo";
  src: string;
}

export interface ChatBubbleElement extends BaseElement {
  type: "chatBubble";
  text: string;
  side: "left" | "right";
  bg: string;
  color: string;
  fontFamily: string;
  size: number;
}

export interface StatBlockElement extends BaseElement {
  type: "statBlock";
  value: string;
  label: string;
  valueColor: string;
  labelColor: string;
  fontFamily: string;
  valueSize: number;
  labelSize: number;
}

export type SceneElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | IconElement
  | PillElement
  | ButtonElement
  | LogoElement
  | ChatBubbleElement
  | StatBlockElement;

export interface Scene {
  w: number;
  h: number;
  background: Background;
  elements: SceneElement[];
}

// ---- constructors / helpers ----

const baseDefaults = (): Pick<BaseElement, "x" | "y" | "w" | "h" | "rotation" | "z"> => ({
  x: 0,
  y: 0,
  w: SCENE_W,
  h: 0,
  rotation: 0,
  z: 0,
});

export function makeText(
  args: Partial<Omit<TextElement, "type">> & { id: string; content: string; size: number }
): TextElement {
  return {
    ...baseDefaults(),
    fontFamily: "sans-serif",
    fontWeight: 400,
    color: "#000000",
    align: "left",
    lineHeight: 1.2,
    ...args,
    type: "text",
  };
}

export function makeImage(
  args: Partial<Omit<ImageElement, "type">> & { id: string; src: string }
): ImageElement {
  return {
    ...baseDefaults(),
    w: SCENE_W,
    h: SCENE_H,
    fit: "cover",
    ...args,
    type: "image",
  };
}

export function makeScene(
  elements: SceneElement[],
  background: Background = { kind: "solid", color: "#ffffff" }
): Scene {
  return { w: SCENE_W, h: SCENE_H, background, elements };
}
