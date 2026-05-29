import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Scene, SceneElement } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { ArchetypeBuilder } from "./types";
import { pickAccent, marginFor, gapFor, baseBackground } from "./_shared";

export const article: ArchetypeBuilder = (kit: BrandKit, brief): Scene => {
  const accent = pickAccent(kit, brief.accentIndex);
  const m = marginFor(kit.shape.density);
  const gap = gapFor(kit.shape.density);
  const colW = SCENE_W - m * 2;
  const elements: SceneElement[] = [];
  let z = 1;
  let y = m;

  // optional logo top-left
  if (kit.logo.src) {
    const logoH = 64;
    elements.push({
      id: "logo", type: "logo", slot: "logo", x: m, y, w: 180, h: logoH,
      rotation: 0, z: z++, src: kit.logo.src,
    });
    y += logoH + gap;
  }

  // kicker pill
  const pillH = 52;
  elements.push({
    id: "kicker", type: "pill", slot: "pill", x: m, y, w: 220, h: pillH,
    rotation: 0, z: z++, text: "Read",
    bg: accent, color: kit.palette.onAccent, fontFamily: kit.type.body.family, size: 24,
  });
  y += pillH + gap;

  const headSize = 72;
  const headLines = Math.max(2, Math.ceil(brief.headline.length / 18));
  const headH = Math.round(headSize * 1.08 * headLines);
  elements.push({
    id: "headline", type: "text", slot: "headline", x: m, y, w: colW, h: headH,
    rotation: 0, z: z++, content: brief.headline,
    fontFamily: kit.type.display.family, fontWeight: kit.type.display.weights.at(-1) ?? 700,
    size: headSize, color: kit.palette.ink, align: "left", lineHeight: 1.08,
  });
  y += headH + gap;

  if (brief.subhead) {
    const subSize = 36;
    const subH = subSize * 2;
    elements.push({
      id: "subhead", type: "text", slot: "subhead", x: m, y, w: colW, h: subH,
      rotation: 0, z: z++, content: brief.subhead,
      fontFamily: kit.type.body.family, fontWeight: 600,
      size: subSize, color: accent, align: "left", lineHeight: 1.25,
    });
    y += subH + gap;
  }

  // divider rule then body paragraph
  elements.push({
    id: "divider", type: "shape", shape: "line", x: m, y, w: colW, h: 2,
    rotation: 0, z: z++, fill: kit.palette.muted, radius: 1,
  });
  y += 2 + gap;

  const bodySize = 30;
  const bodyH = SCENE_H - m - y;
  elements.push({
    id: "body", type: "text", slot: "body", x: m, y, w: colW, h: Math.max(bodySize, bodyH),
    rotation: 0, z: z++, content: brief.body ?? "",
    fontFamily: kit.type.body.family, fontWeight: 400,
    size: bodySize, color: kit.palette.ink, align: "left", lineHeight: 1.5,
  });

  return { w: SCENE_W, h: SCENE_H, background: baseBackground(kit, brief.imagery, accent), elements };
};
