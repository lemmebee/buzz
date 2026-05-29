import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const iconCard: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const elements: SceneElement[] = [];
  let z = 1;

  const cardX = m;
  const cardY = m;
  const cardW = SCENE_W - m * 2;
  const cardH = SCENE_H - m * 2;
  elements.push({
    id: "card", type: "shape", shape: "rect", x: cardX, y: cardY, w: cardW, h: cardH,
    rotation: 0, z: z++, fill: kit.palette.surface, radius: kit.shape.radius,
  });

  const innerPad = gap * 2;
  const iconSize = 120;
  const ix = cardX + innerPad;
  let iy = cardY + innerPad;
  // accent tile behind icon
  elements.push({
    id: "iconTile", type: "shape", shape: "rect", x: ix, y: iy, w: iconSize, h: iconSize,
    rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 2,
  });
  elements.push({
    id: "icon", type: "icon", slot: "icon", x: ix + 24, y: iy + 24, w: iconSize - 48, h: iconSize - 48,
    rotation: 0, z: z++, name: "sparkles", stroke: kit.palette.onAccent, strokeWidth: 2,
    iconStyle: kit.icons.style === "solid" ? "solid" : "line",
  });
  iy += iconSize + gap * 1.5;

  const colW = cardW - innerPad * 2;
  const headSize = 60;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: ix, y: iy, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });
  iy += headH + gap;

  const bodySize = 30;
  const bodyH = cardY + cardH - innerPad - iy;
  elements.push({
    id: "body", type: "text", slot: "body", x: ix, y: iy, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.muted, align: "left", lineHeight: 1.45,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
