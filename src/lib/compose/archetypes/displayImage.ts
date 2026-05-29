import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const displayImage: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const scrimH = Math.round(SCENE_H * 0.5);
  const scrimY = SCENE_H - scrimH;
  // bottom scrim for legibility over the photo
  elements.push({
    id: "scrim", type: "shape", slot: "bg", shape: "rect", x: 0, y: scrimY,
    w: SCENE_W, h: scrimH, rotation: 0, z: z++, fill: kit.palette.bg, radius: 0,
  });

  const headSize = 92;
  const headLines = Math.max(1, Math.ceil(brief.headline.length / 16));
  const headH = Math.round(headSize * 1.04 * headLines);
  const colW = SCENE_W - m * 2;
  let headY = SCENE_H - m - headH;
  if (brief.subhead) headY -= 38 + gap;

  // accent pill marker
  elements.push({
    id: "marker", type: "pill", slot: "pill", x: m, y: headY - 56 - gap,
    w: 220, h: 56, rotation: 0, z: z + 1,
    text: brief.subhead ? "Featured" : "New",
    bg: accent, color: kit.palette.onAccent, fontFamily: kit.type.body.family, size: 26,
  });

  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y: headY, w: colW, h: headH,
    rotation: 0, z: z + 2, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.04,
  });

  if (brief.subhead) {
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y: headY + headH + gap,
      w: colW, h: 38 * 2, rotation: 0, z: z + 2, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600, size: 34,
      color: kit.palette.muted, align: "left", lineHeight: 1.2,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
