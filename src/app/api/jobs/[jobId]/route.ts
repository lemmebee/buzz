import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "failed") {
    return NextResponse.json({ jobId: job.id, status: job.status, error: job.error });
  }

  // Return whatever posts have finished so far — the result is written
  // incrementally, so processing/completed/cancelled all carry partial or full posts.
  const { posts = [], errors = [] } = job.result ? JSON.parse(job.result) : {};
  return NextResponse.json({ jobId: job.id, status: job.status, posts, errors });
}
