import { NextRequest, NextResponse } from "next/server";
import { processJob } from "@/lib/jobQueue";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  // Process the job (this will take a while for video generation)
  await processJob(jobId);

  return NextResponse.json({ success: true });
}
