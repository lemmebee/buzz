import { NextResponse } from "next/server";
import { processScheduledPosts } from "@/lib/scheduler";

export async function POST() {
  const result = await processScheduledPosts();
  return NextResponse.json(result);
}
