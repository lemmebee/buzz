import { NextResponse } from "next/server";
import { getCachedModels, refreshModelsCache, getModelsByType, fetchModelCost } from "@/lib/higgsfield/models";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "image" | "video" | null;
    const costFor = searchParams.get("costFor");

    // On-demand cost fetch for a single model
    if (costFor) {
      const cost = await fetchModelCost(costFor);
      return NextResponse.json({ modelId: costFor, cost });
    }

    if (type) {
      const models = await getModelsByType(type);
      return NextResponse.json(models);
    }

    const cached = await getCachedModels();
    if (!cached) {
      return NextResponse.json({ models: [], fetchedAt: null });
    }
    return NextResponse.json(cached);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Fire-and-forget: start refresh but don't wait for it
    // The client will need to poll GET to check when it's done
    refreshModelsCache().catch((err) => {
      console.error("[higgsfield] background refresh failed:", err);
    });

    return NextResponse.json({ status: "refreshing", message: "Model refresh started. This takes ~1 minute." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start refresh";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
