import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { extractProfileAndStrategy } from "@/lib/brain/extract";
import { snapshotChangedFields } from "@/lib/revisions";

type Params = { params: Promise<{ id: string }> };

const SCREENSHOTS_DIR = join(process.cwd(), "public/media/screenshots");

async function saveScreenshots(files: File[]): Promise<string[]> {
  if (!existsSync(SCREENSHOTS_DIR)) {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
  }
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "png";
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(SCREENSHOTS_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);
    paths.push(`/api/media/screenshots/${filename}`);
  }
  return paths;
}

// GET single product
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const product = await db.select().from(schema.products).where(eq(schema.products.id, parseInt(id))).get();

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

// Apply an update to a product: snapshot the prior values, write the new ones, and
// re-run extraction when the brief changed without a manual profile/strategy edit.
// Shared by both the multipart and JSON PUT paths. Returns null if no row matched.
async function updateProduct(id: number, updateData: Record<string, unknown>) {
  // Snapshot before overwriting
  const existing = await db.select().from(schema.products).where(eq(schema.products.id, id)).get();
  if (existing) {
    await snapshotChangedFields(existing, {
      planFile: updateData.planFile as string | null,
      profile: updateData.profile as string | null | undefined,
      marketingStrategy: updateData.marketingStrategy as string | null | undefined,
    }, "manual");
  }

  const result = await db.update(schema.products)
    .set(updateData)
    .where(eq(schema.products.id, id))
    .returning();

  if (!result.length) return null;

  let updated = result[0];
  // Only re-extract if planFile changed and not manually editing profile/strategy.
  // updateData.profile is set iff body.profile was provided, so this mirrors the
  // original "body.profile === undefined" guard.
  if (updated.planFile && updateData.profile === undefined && updateData.marketingStrategy === undefined) {
    // Set pending status before starting extraction
    const statusResult = await db.update(schema.products)
      .set({ extractionStatus: "pending" })
      .where(eq(schema.products.id, id))
      .returning();
    updated = statusResult[0];
    const screenshotPaths: string[] = updated.screenshots ? JSON.parse(updated.screenshots) : [];
    extractProfileAndStrategy({
      productId: updated.id,
      name: updated.name,
      description: updated.description,
      planFileContent: updated.planFile!,
      screenshotPaths,
      textProvider: updated.textProvider || undefined,
      llmInstructions: updated.llmInstructions || undefined,
    }).catch(console.error);
  }

  return updated;
}

// PUT update product
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const screenshotFiles = formData.getAll("screenshots") as File[];
    const body = JSON.parse(formData.get("data") as string || "{}");

    const keptPaths: string[] = body.existingScreenshots || [];
    const newPaths = screenshotFiles.length > 0 ? await saveScreenshots(screenshotFiles) : [];
    const allPaths = body.replaceScreenshots ? [...keptPaths, ...newPaths] : [...keptPaths, ...newPaths];

    const updateData: Record<string, unknown> = {
      name: body.name,
      description: body.description,
      planFile: body.planFile || null,
      planFileName: body.planFileName || null,
      screenshots: allPaths.length > 0 ? JSON.stringify(allPaths) : null,
      textProvider: body.textProvider || null,
      llmInstructions: body.llmInstructions || null,
    };
    if (body.profile !== undefined) updateData.profile = body.profile;
    if (body.marketingStrategy !== undefined) updateData.marketingStrategy = body.marketingStrategy;

    const updated = await updateProduct(parseInt(id), updateData);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  // JSON fallback
  const body = await req.json();

  const updateData: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    planFile: body.planFile || null,
    planFileName: body.planFileName || null,
    textProvider: body.textProvider || null,
    llmInstructions: body.llmInstructions || null,
  };
  if (body.profile !== undefined) updateData.profile = body.profile;
  if (body.marketingStrategy !== undefined) updateData.marketingStrategy = body.marketingStrategy;

  const updated = await updateProduct(parseInt(id), updateData);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

// DELETE product
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  await db.delete(schema.products).where(eq(schema.products.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
