import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const quote: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;

  const markSize = 200;
  const markY = m + 20;
  elements.push({
    id: "quoteMark", type: "text", x: m, y: markY, w: 200, h: markSize,
    rotation: 0, z: z++, content: "“",
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: markSize, color: accent, align: "left", lineHeight: 1,
  });

  const quoteSize = 64;
  const quoteLines = Math.max(2, Math.ceil(brief.headline.length / 22));
  const quoteH = Math.round(quoteSize * 1.2 * quoteLines);
  const quoteY = markY + markSize - gap;
  elements.push({
    id: "quote", type: "text", slot: "quote", x: m, y: quoteY, w: colW, h: quoteH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights[0] ?? 700,
    size: quoteSize, color: kit.palette.ink, align: "left", lineHeight: 1.2,
  });

  const attrY = quoteY + quoteH + gap;
  elements.push({
    id: "attrRule", type: "shape", shape: "line", x: m, y: attrY + 18, w: 60, h: 4,
    rotation: 0, z: z++, fill: accent, radius: 2,
  });
  elements.push({
    id: "subhead", type: "text", slot: "subhead", x: m + 60 + gap / 2, y: attrY, w: colW - 60 - gap / 2, h: 40,
    rotation: 0, z: z++, content: brief.subhead ?? brief.caption,
    fontFamily: kit.type.body.family, fontWeight: 600,
    size: 30, color: kit.palette.muted, align: "left", lineHeight: 1.2,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
