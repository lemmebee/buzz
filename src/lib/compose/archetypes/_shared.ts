import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type { Background } from "@/lib/compose/scene";
import type { BrandKit } from "@/lib/brain/brandkit";
import type { Brief } from "./types";

export type Density = BrandKit["shape"]["density"];

export function pickAccent(kit: BrandKit, accentIndex: number): string {
  const accents = kit.palette.accents.length ? kit.palette.accents : [kit.palette.ink];
  const i = ((accentIndex % accents.length) + accents.length) % accents.length;
  return accents[i];
}

export function marginFor(density: Density): number {
  switch (density) {
    case "airy": return 120;
    case "tight": return 56;
    default: return 88;
  }
}

export function gapFor(density: Density): number {
  switch (density) {
    case "airy": return 56;
    case "tight": return 20;
    default: return 36;
  }
}

export function withinBounds(box: { x: number; y: number; w: number; h: number }): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.w >= 0 &&
    box.h >= 0 &&
    box.x + box.w <= SCENE_W &&
    box.y + box.h <= SCENE_H
  );
}

export function baseBackground(
  kit: BrandKit,
  imagery: Brief["imagery"],
  accent: string,
): Background {
  if (imagery.kind === "photo") {
    return {
      kind: "image",
      src: imagery.scene ?? "",
      fit: "cover",
      treatment: kit.photo.treatment,
    };
  }
  if (imagery.kind === "gradient") {
    return { kind: "gradient", from: kit.palette.bg, to: accent, angle: 160 };
  }
  return { kind: "solid", color: kit.palette.bg };
}

export const CANVAS = { w: SCENE_W, h: SCENE_H } as const;
