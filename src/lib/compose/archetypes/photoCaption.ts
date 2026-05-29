import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor } from "./_shared";

export const photoCaption: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const imgH = Math.round(SCENE_H * 0.62);
  elements.push({
    id: "photo", type: "image", slot: "bg", x: 0, y: 0, w: SCENE_W, h: imgH,
    rotation: 0, z: z++, src: brief.imagery.scene ?? "", fit: "cover", radius: 0,
  });

  // caption strip background (surface)
  const stripY = imgH;
  const stripH = SCENE_H - imgH;
  elements.push({
    id: "strip", type: "shape", shape: "rect", x: 0, y: stripY, w: SCENE_W, h: stripH,
    rotation: 0, z: z++, fill: kit.palette.surface, radius: 0,
  });

  // accent tab on the strip
  elements.push({
    id: "tab", type: "shape", shape: "rect", x: m, y: stripY + gap, w: 64, h: 8,
    rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 4,
  });

  const colW = SCENE_W - m * 2;
  const headSize = 52;
  const headH = headSize * 2;
  const headY = stripY + gap + 8 + gap;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y: headY, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });

  const bodySize = 28;
  const bodyY = headY + headH + gap;
  const bodyH = SCENE_H - m - bodyY;
  elements.push({
    id: "body", type: "text", slot: "body", x: m, y: bodyY, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.4,
  });

  return {
    w: SCENE_W, h: SCENE_H,
    background: { kind: "solid", color: kit.palette.bg },
    elements,
  };
};
