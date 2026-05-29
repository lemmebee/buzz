import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor } from "./_shared";

export const announce: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  // eyebrow pill
  const pillH = 60;
  let y = m + 40;
  elements.push({
    id: "pill", type: "pill", slot: "pill", x: m, y, w: 260, h: pillH,
    rotation: 0, z: z++, text: "Announcement",
    bg: kit.palette.onAccent, color: accent, fontFamily: kit.type.body.family, size: 26,
  });
  y += pillH + gap * 1.5;

  const headSize = 104;
  const headLines = Math.max(2, Math.ceil(brief.headline.length / 14));
  const headH = Math.round(headSize * 1.02 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.onAccent, align: "left", lineHeight: 1.02,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 38;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: kit.palette.onAccent, align: "left", lineHeight: 1.25,
    });
  }

  // CTA button anchored near the bottom
  const btnH = 92;
  const btnW = Math.min(colW, 480);
  const btnY = SCENE_H - m - btnH;
  elements.push({
    id: "cta", type: "button", slot: "cta", x: m, y: btnY, w: btnW, h: btnH,
    rotation: 0, z: z++, label: "Learn more",
    bg: kit.palette.onAccent, color: accent, fontFamily: kit.type.body.family,
    size: 36, radius: kit.shape.radius,
  });

  return {
    w: SCENE_W, h: SCENE_H,
    background: { kind: "solid", color: accent },
    elements,
  };
};
