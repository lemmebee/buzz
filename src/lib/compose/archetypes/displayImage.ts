import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const displayImage: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];

  // --- measure (conservative: under-estimate chars/line so we OVER-estimate height
  //     and never collide) ---
  const headSize = 84;
  const headCharsPerLine = Math.max(8, Math.floor(colW / (headSize * 0.6)));
  const headLines = Math.max(1, Math.ceil(brief.headline.length / headCharsPerLine));
  const headH = Math.round(headSize * 1.08 * headLines);

  const subSize = 34;
  const subCharsPerLine = Math.max(12, Math.floor(colW / (subSize * 0.55)));
  const subLines = brief.subhead ? Math.max(1, Math.ceil(brief.subhead.length / subCharsPerLine)) : 0;
  const subH = Math.round(subSize * 1.25 * subLines);

  const pillH = 52;
  const pillW = 200;

  // --- stack bottom-up: each block sits above the previous with a gap (no overlap possible) ---
  let cursor = SCENE_H - m; // bottom edge of the next (lowest) block

  let subY = 0;
  if (brief.subhead) {
    subY = cursor - subH;
    cursor = subY - gap;
  }
  const headY = cursor - headH;
  cursor = headY - gap;
  const pillY = cursor - pillH;

  // scrim: cover from a bit above the pill down to the bottom, for legibility over the photo
  const scrimTop = Math.min(pillY - 32, Math.round(SCENE_H * 0.45));
  let z = 1;
  elements.push({
    id: "scrim", type: "shape", slot: "bg", shape: "rect", x: 0, y: scrimTop,
    w: SCENE_W, h: SCENE_H - scrimTop, rotation: 0, z: z++, fill: kit.palette.bg, radius: 0,
  });

  elements.push({
    id: "marker", type: "pill", slot: "pill", x: m, y: pillY,
    w: pillW, h: pillH, rotation: 0, z: z++,
    text: brief.subhead ? "Featured" : "New",
    bg: accent, color: kit.palette.onAccent, fontFamily: kit.type.body.family, size: 24,
  });

  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y: headY, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.08,
  });

  if (brief.subhead) {
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y: subY,
      w: colW, h: subH, rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600, size: subSize,
      color: kit.palette.muted, align: "left", lineHeight: 1.25,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
