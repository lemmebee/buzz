import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes, randomUUID } from "crypto";
import { db, schema } from "@/lib/db";
import { extractProfileAndStrategy } from "@/lib/brain/extract";
import { normalizeChannelHints, normalizeICP, normalizeJTBDList } from "@/lib/brain/types";

const SCREENSHOTS_DIR = join(process.cwd(), "public/media/screenshots");
const LOGOS_DIR = join(process.cwd(), "public/media/logos");

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

async function saveLogo(file: File): Promise<string> {
  if (!existsSync(LOGOS_DIR)) {
    await mkdir(LOGOS_DIR, { recursive: true });
  }
  const ext = file.name.split(".").pop() || "png";
  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(LOGOS_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);
  return `/api/media/logos/${filename}`;
}

// GET all products
export async function GET() {
  const products = await db.select().from(schema.products);
  return NextResponse.json(products);
}

interface ProductBody {
  name: string;
  description: string;
  planFile?: string | null;
  planFileName?: string | null;
  icp?: unknown;
  jtbd?: unknown;
  channelHints?: unknown;
  landingUrl?: string | null;
  textProvider?: string | null;
  imageProvider?: string | null;
  contentEngine?: string | null;
  llmInstructions?: string | null;
}

async function createProduct(body: ProductBody, screenshotPaths: string[], logoPath: string | null) {
  const result = await db.insert(schema.products).values({
    name: body.name,
    description: body.description,
    planFile: body.planFile || null,
    planFileName: body.planFileName || null,
    screenshots: screenshotPaths.length > 0 ? JSON.stringify(screenshotPaths) : null,
    logo: logoPath,
    icp: normalizeICP(body.icp),
    jtbd: normalizeJTBDList(body.jtbd),
    channelHints: normalizeChannelHints(body.channelHints),
    landingUrl: body.landingUrl || null,
    attributionWebhookSecret: randomBytes(32).toString("hex"),
    textProvider: body.textProvider || null,
    imageProvider: body.imageProvider || null,
    contentEngine: body.contentEngine || null,
    llmInstructions: body.llmInstructions || null,
    extractionStatus: body.planFile ? "pending" : null,
  }).returning();

  const created = result[0];

  if (created.planFile) {
    extractProfileAndStrategy({
      productId: created.id,
      name: created.name,
      description: created.description,
      planFileContent: created.planFile,
      screenshotPaths,
      logoPath: created.logo,
      textProvider: created.textProvider || undefined,
      llmInstructions: created.llmInstructions || undefined,
    }).catch(console.error);
  }

  return created;
}

// POST new product
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const screenshotFiles = formData.getAll("screenshots") as File[];
    const screenshotPaths = screenshotFiles.length > 0 ? await saveScreenshots(screenshotFiles) : [];
    const logoFile = formData.get("logo") as File | null;
    const logoPath = logoFile && logoFile.size > 0 ? await saveLogo(logoFile) : null;
    const body = JSON.parse(formData.get("data") as string || "{}");
    const created = await createProduct(body, screenshotPaths, logoPath);
    return NextResponse.json(created, { status: 201 });
  }

  const body = await req.json();
  const created = await createProduct(body, [], null);
  return NextResponse.json(created, { status: 201 });
}
