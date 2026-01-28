import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { db, schema } from "@/lib/db";
import { extractProfileAndStrategy } from "@/lib/brain/extract";

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
    paths.push(`/media/screenshots/${filename}`);
  }
  return paths;
}

// GET all products
export async function GET() {
  const products = await db.select().from(schema.products);
  return NextResponse.json(products);
}

// POST new product
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const screenshotFiles = formData.getAll("screenshots") as File[];
    const screenshotPaths = screenshotFiles.length > 0 ? await saveScreenshots(screenshotFiles) : [];

    const body = JSON.parse(formData.get("data") as string || "{}");

    const result = await db.insert(schema.products).values({
      name: body.name,
      description: body.description,
      url: body.url || null,
      audience: body.audience || null,
      tone: body.tone || null,
      planFile: body.planFile || null,
      planFileName: body.planFileName || null,
      screenshots: screenshotPaths.length > 0 ? JSON.stringify(screenshotPaths) : null,
      textProvider: body.textProvider || null,
      extractionStatus: body.planFile ? "pending" : null,
    }).returning();

    const created = result[0];

    // Extract profile + strategy if brief exists
    if (created.planFile) {
      extractProfileAndStrategy(created.id, created.planFile, screenshotPaths, created.textProvider || undefined).catch(console.error);
    }

    return NextResponse.json(created, { status: 201 });
  }

  // JSON fallback (no screenshots)
  const body = await req.json();

  const result = await db.insert(schema.products).values({
    name: body.name,
    description: body.description,
    url: body.url || null,
    audience: body.audience || null,
    tone: body.tone || null,
    planFile: body.planFile || null,
    planFileName: body.planFileName || null,
    textProvider: body.textProvider || null,
    extractionStatus: body.planFile ? "pending" : null,
  }).returning();

  const created = result[0];

  if (created.planFile) {
    extractProfileAndStrategy(created.id, created.planFile, [], created.textProvider || undefined).catch(console.error);
  }

  return NextResponse.json(created, { status: 201 });
}
