import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const stat: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  const blockH = 460;
  const blockY = Math.round((SCENE_H - blockH) / 2);
  elements.push({
    id: "stat", type: "statBlock", slot: "stat", x: m, y: blockY, w: colW, h: blockH,
    rotation: 0, z: z++,
    value: brief.headline,
    label: brief.subhead ?? brief.body ?? "",
    valueColor: accent, labelColor: kit.palette.ink,
    fontFamily: kit.type.display.family, valueSize: 240, labelSize: 40,
  });

  // supporting body below the stat block
  if (brief.body && brief.subhead) {
    const bodyY = blockY + blockH + gap;
    elements.push({
      id: "body", type: "text", slot: "body", x: m, y: bodyY, w: colW,
      h: Math.max(30, SCENE_H - m - bodyY), rotation: 0, z: z++, content: brief.body,
      fontFamily: kit.type.body.family, fontWeight: 400,
      size: 28, color: kit.palette.muted, align: "center", lineHeight: 1.4,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
