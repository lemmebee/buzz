import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const editorial: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m + 40;

  // accent rule above the headline (editorial signature)
  elements.push({
    id: "rule", type: "shape", shape: "line", x: m, y, w: 140, h: 6,
    rotation: 0, z: z++, fill: accent, radius: 3,
  });
  y += 6 + gap;

  const headSize = 86;
  const headLines = Math.max(1, Math.ceil(brief.headline.length / 18));
  const headH = Math.round(headSize * 1.05 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.05,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 38;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: accent, align: "left", lineHeight: 1.2,
    });
    y += subH + gap;
  }

  if (brief.body) {
    const bodySize = 30;
    const bodyH = SCENE_H - m - y;
    elements.push({
      id: "body", type: "text", slot: "body", x: m, y, w: colW, h: Math.max(bodySize, bodyH),
      rotation: 0, z: z++, content: brief.body,
      fontFamily: kit.type.body.family, fontWeight: 400,
      size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.45,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
