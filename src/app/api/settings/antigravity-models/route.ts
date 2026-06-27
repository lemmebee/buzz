import { NextResponse } from "next/server";
import { listAntigravityModels } from "@/lib/providers";

export async function GET() {
  try {
    const models = await listAntigravityModels();
    return NextResponse.json(models);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
