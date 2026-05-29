import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSceneRenderer } from "@/lib/providers";
import { resolveFont } from "@/lib/compose/fonts";
import { getCachedBrandKit } from "@/lib/brain/brandkit";
import { snapshotContentScene } from "@/lib/contentRevisions";
import type { Scene } from "@/lib/compose/scene";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";

function isScene(v: unknown): v is Scene {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    s.w === SCENE_W &&
    s.h === SCENE_H &&
    !!s.background &&
    Array.isArray(s.elements)
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentId = parseInt(id, 10);
  if (Number.isNaN(contentId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const [row] = await db
    .select()
    .from(schema.content)
    .where(eq(schema.content.id, contentId));
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const kit =
    row.productId != null
      ? await (async () => {
          const [p] = await db
            .select()
            .from(schema.products)
            .where(eq(schema.products.id, row.productId!));
          return p ? getCachedBrandKit(p) : null;
        })()
      : null;
  return NextResponse.json({
    // scene is drizzle mode:"json" -> already a parsed object.
    scene: (row.scene as Scene | null) ?? null,
    mediaUrl: row.mediaUrl,
    brandKit: kit,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentId = parseInt(id, 10);
  if (Number.isNaN(contentId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

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

  const [row] = await db
    .select()
    .from(schema.content)
    .where(eq(schema.content.id, contentId));
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve the fonts referenced by the scene so the server render matches the editor.
  const kit = row.productId
    ? await (async () => {
        const [p] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, row.productId!));
        return p ? getCachedBrandKit(p) : null;
      })()
    : null;

  const fams = new Map<string, { name: string; klass: "serif" | "sans" | "display" | "mono"; weight: number }>();
  for (const el of scene.elements) {
    if ("fontFamily" in el && typeof (el as { fontFamily?: string }).fontFamily === "string") {
      const family = (el as { fontFamily: string }).fontFamily;
      const weight = "fontWeight" in el ? Number((el as { fontWeight?: number }).fontWeight) || 400 : 400;
      const klass =
        kit && kit.type.display.family === family ? kit.type.display.class
        : kit && kit.type.body.family === family ? kit.type.body.class
        : "sans";
      fams.set(`${family}:${weight}`, { name: family, klass, weight });
    }
  }

  const fonts = await Promise.all(
    Array.from(fams.values()).map(async (f) => {
      const rf = await resolveFont(f.name, f.klass, f.weight);
      return { name: rf.family, data: rf.data, weight: rf.weight, style: "normal" as const };
    }),
  );

  const rendered = await getSceneRenderer().generate({ scene, fonts });

  // Snapshot the prior scene before overwriting (mode:"json" -> stringify the prior object).
  await snapshotContentScene(
    contentId,
    row.scene != null ? JSON.stringify(row.scene) : null,
    "manual",
  );

  const mediaUrl = rendered.localPath ?? rendered.url;
  const [updated] = await db
    .update(schema.content)
    .set({
      // scene is drizzle mode:"json" -> write the raw object (no JSON.stringify).
      scene,
      mediaUrl,
      publicMediaUrl: rendered.url,
    })
    .where(eq(schema.content.id, contentId))
    .returning();

  return NextResponse.json(updated);
}
