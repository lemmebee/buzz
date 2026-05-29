import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const steps: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  const headSize = 60;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.1,
  });
  y += headH + gap * 1.5;

  const lines = (brief.body ?? brief.subhead ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  const badge = 72;
  const rowH = 120;
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + i * (rowH + gap);
    elements.push({
      id: `stepBadge${i}`, type: "shape", shape: "rect", x: m, y: rowY, w: badge, h: badge,
      rotation: 0, z: z++, fill: accent, radius: kit.shape.radius / 2,
    });
    elements.push({
      id: `stepNum${i}`, type: "text", x: m, y: rowY + 12, w: badge, h: badge - 12,
      rotation: 0, z: z++, content: String(i + 1),
      fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
      size: 44, color: kit.palette.onAccent, align: "center", lineHeight: 1,
    });
    elements.push({
      id: `stepText${i}`, type: "text", x: m + badge + gap, y: rowY + 8, w: colW - badge - gap, h: rowH - 8,
      rotation: 0, z: z++, content: lines[i],
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: 34, color: kit.palette.ink, align: "left", lineHeight: 1.25,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
