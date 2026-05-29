import { SCENE_W, SCENE_H, type Scene, type SceneElement } from "@/lib/compose/scene";

const MIN_SIZE = 8;

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function findElement(scene: Scene, id: string): SceneElement | undefined {
  return scene.elements.find((el) => el.id === id);
}

function replaceElement(
  scene: Scene,
  id: string,
  fn: (el: SceneElement) => SceneElement,
): Scene {
  let found = false;
  const elements = scene.elements.map((el) => {
    if (el.id !== id) return el;
    found = true;
    return fn(el);
  });
  if (!found) throw new Error(`Element not found: ${id}`);
  return { ...scene, elements };
}

export function moveElement(scene: Scene, id: string, x: number, y: number): Scene {
  return replaceElement(scene, id, (el) => ({
    ...el,
    x: clamp(Math.round(x), 0, Math.max(0, SCENE_W - el.w)),
    y: clamp(Math.round(y), 0, Math.max(0, SCENE_H - el.h)),
  }));
}

export function resizeElement(scene: Scene, id: string, w: number, h: number): Scene {
  return replaceElement(scene, id, (el) => ({
    ...el,
    w: clamp(Math.round(w), MIN_SIZE, Math.max(MIN_SIZE, SCENE_W - el.x)),
    h: clamp(Math.round(h), MIN_SIZE, Math.max(MIN_SIZE, SCENE_H - el.y)),
  }));
}

// Text-bearing element types and the field that holds their copy.
const TEXT_FIELD: Partial<Record<SceneElement["type"], string>> = {
  text: "content",
  pill: "text",
  button: "label",
  chatBubble: "text",
};

export function setText(scene: Scene, id: string, value: string): Scene {
  return replaceElement(scene, id, (el) => {
    const field = TEXT_FIELD[el.type];
    if (!field) throw new Error(`Element ${id} (${el.type}) has no editable text`);
    return { ...el, [field]: value } as SceneElement;
  });
}

export function swapImage(scene: Scene, id: string, src: string): Scene {
  return replaceElement(scene, id, (el) => {
    if (el.type !== "image" && el.type !== "logo") {
      throw new Error(`Element ${id} (${el.type}) is not an image`);
    }
    return { ...el, src } as SceneElement;
  });
}
