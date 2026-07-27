import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const contentId = searchParams.get("contentId");
  const productId = searchParams.get("productId");
  const phase = searchParams.get("phase");
  const list = searchParams.get("list");

  try {
    // Flat, paginated feed for the /traces page. Any filter is optional here,
    // unlike the grouped mode below which is always scoped to one entity.
    if (list) {
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
      const offset = parseInt(searchParams.get("offset") || "0");
      const status = searchParams.get("status");
      const engine = searchParams.get("engine");

      const conditions = [];
      if (productId) conditions.push(eq(schema.generationTraces.productId, parseInt(productId)));
      if (phase) conditions.push(eq(schema.generationTraces.phase, phase));
      if (status) conditions.push(eq(schema.generationTraces.status, status));
      if (engine) conditions.push(eq(schema.generationTraces.engine, engine));
      const where = conditions.length ? and(...conditions) : undefined;

      const rows = await db.select().from(schema.generationTraces)
        .where(where)
        .orderBy(desc(schema.generationTraces.id))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.generationTraces)
        .where(where);

      // Distinct values so the UI can build filters without a second round-trip.
      const facets = await db
        .select({
          phase: schema.generationTraces.phase,
          engine: schema.generationTraces.engine,
          status: schema.generationTraces.status,
        })
        .from(schema.generationTraces);

      return NextResponse.json({
        items: rows.map(preview),
        total: Number(count) || 0,
        limit,
        offset,
        facets: {
          phases: Array.from(new Set(facets.map((f) => f.phase).filter(Boolean))).sort(),
          engines: Array.from(new Set(facets.map((f) => f.engine).filter(Boolean))).sort(),
          statuses: Array.from(new Set(facets.map((f) => f.status).filter(Boolean))).sort(),
        },
      });
    }

    let traces;

    if (jobId) {
      traces = await db.select().from(schema.generationTraces)
        .where(eq(schema.generationTraces.jobId, jobId))
        .orderBy(desc(schema.generationTraces.createdAt));
    } else if (contentId) {
      traces = await db.select().from(schema.generationTraces)
        .where(eq(schema.generationTraces.contentId, parseInt(contentId)))
        .orderBy(desc(schema.generationTraces.createdAt));
    } else if (productId) {
      const conditions = [eq(schema.generationTraces.productId, parseInt(productId))];
      if (phase) {
        conditions.push(eq(schema.generationTraces.phase, phase));
      }
      traces = await db.select().from(schema.generationTraces)
        .where(and(...conditions))
        .orderBy(desc(schema.generationTraces.createdAt));
    } else {
      return NextResponse.json({ error: "jobId, contentId, or productId required" }, { status: 400 });
    }

    const grouped = traces.reduce((acc, trace) => {
      (acc[trace.phase] ||= []).push(preview(trace));
      return acc;
    }, {} as Record<string, unknown[]>);

    return NextResponse.json(grouped);
  } catch (err) {
    console.error("[traces] API error:", err);
    return NextResponse.json({ error: "Failed to fetch traces" }, { status: 500 });
  }
}

type TraceRow = typeof schema.generationTraces.$inferSelect;

/**
 * List responses carry previews only — a full prompt can be tens of KB and a
 * feed of fifty would be unusable. `GET /api/traces/[id]` returns the whole
 * record; `truncated` tells the UI when that is worth fetching.
 */
function preview(trace: TraceRow) {
  const clip = (v: string | null) =>
    v && v.length > PREVIEW_CHARS ? v.slice(0, PREVIEW_CHARS) + "…" : v;

  return {
    ...trace,
    input: clip(trace.input),
    output: clip(trace.output),
    truncated:
      (trace.input?.length ?? 0) > PREVIEW_CHARS ||
      (trace.output?.length ?? 0) > PREVIEW_CHARS,
  };
}
