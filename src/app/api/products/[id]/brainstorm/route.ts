import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { BrainstormIdeaRow } from "../../../../../../drizzle/schema";
import { createTextProvider } from "@/lib/providers";
import { getTextProvider } from "@/lib/settings";
import { buildBrainstormPrompt, parseBrainstormResponse } from "@/lib/brain/prompts";
import { classifyProviderError } from "@/lib/providers/errors";

type Params = { params: Promise<{ id: string }> };

/** DB row -> API idea shape (scores nested, like the brainstorm engine output). */
function rowToIdea(row: BrainstormIdeaRow) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    hook: row.hook,
    whyItWorks: row.whyItWorks ?? "",
    format: row.format ?? "",
    riskiestAssumption: row.riskiestAssumption ?? "",
    scores: {
      novelty: row.noveltyScore ?? 3,
      fit: row.fitScore ?? 3,
      feasibility: row.feasibilityScore ?? 3,
    },
    theme: row.theme ?? null,
    createdAt: row.createdAt,
  };
}

// List saved ideas (newest first). Available even without a profile/strategy.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const productId = parseInt(id);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(schema.brainstormIdeas)
    .where(eq(schema.brainstormIdeas.productId, productId))
    .orderBy(desc(schema.brainstormIdeas.createdAt), desc(schema.brainstormIdeas.id));

  return NextResponse.json({ ideas: rows.map(rowToIdea) });
}

// Generate a fresh batch, persist it, and return the saved ideas.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const productId = parseInt(id);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (!product.profile || !product.marketingStrategy) {
    return NextResponse.json(
      { error: "Product missing profile or marketing strategy. Extract it first." },
      { status: 400 }
    );
  }

  // Optional body: { count?: number, theme?: string }
  let count = 8;
  let theme: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      if (typeof body.count === "number") count = body.count;
      if (typeof body.theme === "string" && body.theme.trim()) theme = body.theme.trim();
    }
  } catch {
    // no body is fine — use defaults
  }

  const rawProfile = JSON.parse(product.profile);
  const rawStrategy = JSON.parse(product.marketingStrategy);

  try {
    const provider = createTextProvider(product.textProvider || (await getTextProvider()));
    const systemPrompt = buildBrainstormPrompt(rawProfile, rawStrategy, { count, theme, llmInstructions: product.llmInstructions || undefined });

    const result = await provider.generate({
      systemPrompt,
      userPrompt: `Brainstorm the ideas now. Return ONLY a valid JSON array, no markdown.`,
      maxTokens: Math.min(8192, count * 400 + 800),
      temperature: 1.0,
    });

    const ideas = parseBrainstormResponse(result.text);
    if (ideas.length === 0) {
      return NextResponse.json({ error: "Model returned no usable ideas." }, { status: 502 });
    }

    const saved = await db
      .insert(schema.brainstormIdeas)
      .values(
        ideas.map((i) => ({
          productId,
          title: i.title,
          kind: i.kind,
          hook: i.hook,
          whyItWorks: i.whyItWorks || null,
          format: i.format || null,
          riskiestAssumption: i.riskiestAssumption || null,
          noveltyScore: i.scores.novelty,
          fitScore: i.scores.fit,
          feasibilityScore: i.scores.feasibility,
          theme: theme || null,
        }))
      )
      .returning();

    return NextResponse.json({ ideas: saved.map(rowToIdea) });
  } catch (error) {
    console.error(`Brainstorm failed for product ${productId}:`, error);
    return NextResponse.json({ error: classifyProviderError(error) }, { status: 500 });
  }
}

// Delete a single saved idea: DELETE ...?ideaId=123
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const productId = parseInt(id);
  const ideaId = parseInt(req.nextUrl.searchParams.get("ideaId") || "");
  if (isNaN(productId) || isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid product or idea ID" }, { status: 400 });
  }

  await db
    .delete(schema.brainstormIdeas)
    .where(and(eq(schema.brainstormIdeas.id, ideaId), eq(schema.brainstormIdeas.productId, productId)));

  return NextResponse.json({ ok: true });
}
