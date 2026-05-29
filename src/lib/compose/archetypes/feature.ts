import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const feature: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const iconStyle = kit.icons.style === "solid" ? "solid" : "line";
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  const headSize = 66;
  const headH = headSize * 2;
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.08,
  });
  y += headH + gap;

  const subSize = 34;
  const subH = subSize * 2;
  elements.push({
    id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
    rotation: 0, z: z++, content: brief.subhead ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: subSize, color: kit.palette.muted, align: "left", lineHeight: 1.3,
  });
  y += subH + gap * 1.5;

  const lines = (brief.body ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  const iconBox = 64;
  const rowH = 100;
  const names = ["zap", "edit", "calendar", "check"];
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + i * (rowH + gap);
    elements.push({
      id: `featIcon${i}`, type: "icon", slot: i === 0 ? "icon" : undefined,
      x: m, y: rowY, w: iconBox, h: iconBox, rotation: 0, z: z++,
      name: names[i % names.length], stroke: accent, strokeWidth: 2.5, iconStyle,
    });
    elements.push({
      id: `featLabel${i}`, type: "text", x: m + iconBox + gap, y: rowY + 8,
      w: colW - iconBox - gap, h: rowH - 8, rotation: 0, z: z++, content: lines[i],
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: 34, color: kit.palette.ink, align: "left", lineHeight: 1.25,
    });
  }

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
