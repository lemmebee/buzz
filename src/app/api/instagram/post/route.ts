import { NextRequest, NextResponse } from "next/server";
import { publishPost } from "@/lib/instagram";

export async function POST(req: NextRequest) {
  const { postId } = await req.json();

  if (!postId) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const result = await publishPost(postId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    instagramId: result.instagramId,
  });
}
