import { NextResponse } from "next/server";
// Use the factory, not getSceneRenderer(): Next bundles route handlers in a separate
// webpack runtime from instrumentation.ts, so the boot-time registry is empty here.
import { createSceneRenderer } from "@/lib/providers";
import { resolveFont } from "@/lib/compose/fonts";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

function isScene(v: unknown): v is Scene {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return s.w === SCENE_W && s.h === SCENE_H && !!s.background && Array.isArray(s.elements);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  void ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const scene = (body as { scene?: unknown })?.scene;
  if (!isScene(scene)) {
    return NextResponse.json({ error: "Invalid scene" }, { status: 400 });
  }

  const fams = new Map<string, number>();
  for (const el of scene.elements) {
    if ("fontFamily" in el && typeof (el as { fontFamily?: string }).fontFamily === "string") {
      const family = (el as { fontFamily: string }).fontFamily;
      const weight = "fontWeight" in el ? Number((el as { fontWeight?: number }).fontWeight) || 400 : 400;
      fams.set(`${family}::${weight}`, weight);
    }
  }
  const fonts = await Promise.all(
    Array.from(fams.entries()).map(async ([key, weight]) => {
      const family = key.split("::")[0];
      const rf = await resolveFont(family, "sans", weight);
      return { name: rf.family, data: rf.data, weight: rf.weight, style: "normal" as const };
    }),
  );

  const out = await createSceneRenderer().generate({ scene, fonts });
  if (!out.svg) {
    return NextResponse.json({ error: "Renderer produced no SVG" }, { status: 500 });
  }
  return new NextResponse(out.svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}
