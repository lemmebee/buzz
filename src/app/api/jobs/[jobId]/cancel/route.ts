import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "../../../../../../drizzle/schema";
import { eq } from "drizzle-orm";

// Request cancellation of an in-flight generation. The running job polls this
// flag between variations (see processJob), so already-finished posts are kept
// and only the remaining variations are skipped.
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json({ jobId, status: job.status });
  }

  await db.update(jobs).set({ cancelRequested: true, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  return NextResponse.json({ jobId, status: "cancelling" });
}
