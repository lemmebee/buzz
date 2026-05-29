import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { z } from "zod";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "invalid hex");

// Only palette hexes + logo are editable in v1 (spec minimal override).
const overrideSchema = z.object({
  palette: z.object({
    bg: hex.optional(), surface: hex.optional(), ink: hex.optional(),
    muted: hex.optional(), onAccent: hex.optional(),
    accents: z.array(hex).optional(),
  }).partial().optional(),
  logo: z.object({ src: z.string().min(1).optional(), mark: z.string().optional() }).partial().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let patch;
  try {
    patch = overrideSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid override" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, Number(params.id)) });
  if (!product || !product.brandKit) {
    return Response.json({ error: "product or brandKit not found" }, { status: 404 });
  }

  const kit = product.brandKit as {
    palette?: Record<string, unknown>;
    logo?: Record<string, unknown>;
    source?: { at?: number } & Record<string, unknown>;
    [k: string]: unknown;
  };
  const merged = {
    ...kit,
    palette: { ...kit.palette, ...(patch.palette || {}) },
    logo: { ...kit.logo, ...(patch.logo || {}) },
    source: { ...kit.source, from: "upload", at: kit.source?.at ?? 0 },
  };

  await db.update(schema.products)
    .set({ brandKit: merged, brandKitUpdatedAt: new Date() })
    .where(eq(schema.products.id, Number(params.id)));

  return Response.json({ ok: true, brandKit: merged });
}
