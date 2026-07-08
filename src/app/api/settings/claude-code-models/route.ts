import { NextResponse } from "next/server";
import { listClaudeCodeModels } from "@/lib/providers";

export async function GET() {
  try {
    const models = await listClaudeCodeModels();
    return NextResponse.json(models);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
