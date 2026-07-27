import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const contentId = searchParams.get("contentId");
  const productId = searchParams.get("productId");
  const phase = searchParams.get("phase");

  try {
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

    // Group by phase and truncate long inputs/outputs
    const grouped = traces.reduce((acc, trace) => {
      if (!acc[trace.phase]) {
        acc[trace.phase] = [];
      }
      
      const truncated = {
        ...trace,
        input: trace.input && trace.input.length > 1000 
          ? trace.input.slice(0, 1000) + "... [truncated]" 
          : trace.input,
        output: trace.output && trace.output.length > 1000 
          ? trace.output.slice(0, 1000) + "... [truncated]" 
          : trace.output,
        truncated: (trace.input && trace.input.length > 1000) || (trace.output && trace.output.length > 1000),
      };
      
      acc[trace.phase].push(truncated);
      return acc;
    }, {} as Record<string, unknown[]>);

    return NextResponse.json(grouped);
  } catch (err) {
    console.error("[traces] API error:", err);
    return NextResponse.json({ error: "Failed to fetch traces" }, { status: 500 });
  }
}
