import { NextRequest, NextResponse } from "next/server";
import { processJob } from "@/lib/jobQueue";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  // Do NOT await: a video render can take minutes, and the fire-and-forget
  // trigger from /api/generate would otherwise hit undici's headersTimeout
  // (~300s) and log "fetch failed". processJob records status/result to the DB,
  // which the client polls via /api/jobs/[jobId]. PM2 runs a long-lived node
  // server, so the detached promise keeps running after this response returns.
  processJob(jobId).catch((err) =>
    console.error(`[jobs] processJob ${jobId} failed:`, err)
  );

  return NextResponse.json({ accepted: true, jobId });
}
