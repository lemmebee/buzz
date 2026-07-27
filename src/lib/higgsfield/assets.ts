import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hfPresignUpload, hfPutBytes, hfConfirmUpload } from "./client";
import { isTerminalProviderError } from "@/lib/providers/errors";
import sharp from "sharp";

const MAX_SCREENSHOTS = 4;

// Raster formats that Higgsfield image models accept
const RASTER_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function resolveFilePath(localPath: string): string {
  const stripped = localPath.replace(/^\/api\/media\//, "");
  return join(process.cwd(), "public", "media", stripped);
}

function contentTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

function getExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot !== -1 ? path.slice(dot) : "";
}

interface AssetToUpload {
  localPath: string;
  filePath: string;
  kind: string;
  contentType: string;
  isSvg: boolean;
}

export async function invalidateMediaCache(mediaIds: string[]): Promise<void> {
  if (mediaIds.length === 0) return;
  try {
    await db.delete(schema.higgsfieldAssets).where(
      inArray(schema.higgsfieldAssets.hfMediaId, mediaIds)
    );
    console.log(`[higgsfield] invalidated ${mediaIds.length} cached media IDs`);
  } catch (err) {
    console.warn(`[higgsfield] failed to invalidate cache:`, err);
  }
}

export async function ensureProductAssetsUploaded(
  productId: number
): Promise<{ logoMediaId?: string; screenshotMediaIds: string[] }> {
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
  });
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  const toUpload: AssetToUpload[] = [];
  let logoSkipped = false;

  if (product.logo) {
    const existing = await db.query.higgsfieldAssets.findFirst({
      where: and(
        eq(schema.higgsfieldAssets.productId, productId),
        eq(schema.higgsfieldAssets.localPath, product.logo)
      ),
    });
    if (!existing?.hfMediaId) {
      const filePath = resolveFilePath(product.logo);
      if (existsSync(filePath)) {
        const ext = getExt(product.logo);
        const isSvg = ext.toLowerCase() === ".svg";
        
        // SVG will be rasterized, other non-raster formats are skipped
        if (!isSvg && !RASTER_EXTS.has(ext.toLowerCase())) {
          console.log(`[higgsfield] skipping ${product.logo} — unsupported format for generation input`);
          logoSkipped = true;
        } else {
          toUpload.push({
            localPath: product.logo,
            filePath,
            kind: "logo",
            contentType: isSvg ? "image/png" : contentTypeFromExt(ext),
            isSvg,
          });
        }
      } else {
        console.warn(`[higgsfield] logo file not found: ${filePath}`);
      }
    }
  }

  let screenshotPaths: string[] = [];
  if (product.screenshots) {
    try {
      screenshotPaths = JSON.parse(product.screenshots);
    } catch (err) {
      console.warn(`[higgsfield] failed to parse screenshots JSON for product ${productId}:`, err);
    }
  }
  const capped = screenshotPaths.slice(0, MAX_SCREENSHOTS);

  for (const path of capped) {
    const existing = await db.query.higgsfieldAssets.findFirst({
      where: and(
        eq(schema.higgsfieldAssets.productId, productId),
        eq(schema.higgsfieldAssets.localPath, path)
      ),
    });
    if (!existing?.hfMediaId) {
      const filePath = resolveFilePath(path);
      if (existsSync(filePath)) {
        const ext = getExt(path);
        const isSvg = ext.toLowerCase() === ".svg";
        
        // SVG will be rasterized, other non-raster formats are skipped
        if (!isSvg && !RASTER_EXTS.has(ext.toLowerCase())) {
          console.log(`[higgsfield] skipping ${path} — unsupported format for generation input`);
        } else {
          toUpload.push({
            localPath: path,
            filePath,
            kind: "screenshot",
            contentType: isSvg ? "image/png" : contentTypeFromExt(ext),
            isSvg,
          });
        }
      } else {
        console.warn(`[higgsfield] screenshot file not found: ${filePath}`);
      }
    }
  }

  if (toUpload.length === 0) {
    console.log(`[higgsfield] all assets already uploaded for product ${productId}`);
    const allAssets = await db.query.higgsfieldAssets.findMany({
      where: eq(schema.higgsfieldAssets.productId, productId),
    });
    const logo = allAssets.find(a => a.kind === "logo");
    const screenshots = allAssets.filter(a => a.kind === "screenshot");
    
    if (logo) {
      console.log(`[higgsfield] reference: logo (cached) -> ${logo.hfMediaId}`);
    } else if (logoSkipped) {
      console.log(`[higgsfield] reference: screenshot 1 (logo skipped — unsupported format)`);
    }
    
    return {
      logoMediaId: logo?.hfMediaId ?? undefined,
      screenshotMediaIds: screenshots.map(s => s.hfMediaId!).filter(Boolean),
    };
  }

  try {
    const files = toUpload.map(a => ({
      filename: a.isSvg 
        ? (a.localPath.split("/").pop() || "file").replace(/\.svg$/i, ".png")
        : (a.localPath.split("/").pop() || "file"),
      contentType: a.contentType,
    }));

    const presigned = await hfPresignUpload(files);

    if (presigned.length !== toUpload.length) {
      throw new Error(`Presigned ${presigned.length} files but expected ${toUpload.length}`);
    }

    await Promise.all(
      toUpload.map(async (asset, i) => {
        let buffer: Buffer = await readFile(asset.filePath);
        
        // Rasterize SVG to PNG
        if (asset.isSvg) {
          buffer = await sharp(buffer)
            .png()
            .resize({ width: 1024, withoutEnlargement: true })
            .toBuffer();
          console.log(`[higgsfield] rasterized SVG: ${asset.localPath} -> PNG`);
        }
        
        await hfPutBytes(presigned[i].uploadUrl, buffer, asset.contentType);
        await hfConfirmUpload(presigned[i].mediaId, "image");

        // Only cache after confirm succeeds — a cached id that was never confirmed
        // poisons every future generation for that product, silently, forever.
        await db.insert(schema.higgsfieldAssets).values({
          productId,
          localPath: asset.localPath,
          kind: asset.kind,
          hfMediaId: presigned[i].mediaId,
        });

        const refType = asset.kind === "logo" 
          ? (asset.isSvg ? "logo (rasterised from svg)" : "logo")
          : (asset.isSvg ? "screenshot (rasterised from svg)" : "screenshot");
        console.log(`[higgsfield] reference: ${refType} -> ${presigned[i].mediaId}`);
      })
    );

    const allAssets = await db.query.higgsfieldAssets.findMany({
      where: eq(schema.higgsfieldAssets.productId, productId),
    });
    const logo = allAssets.find(a => a.kind === "logo");
    const screenshots = allAssets.filter(a => a.kind === "screenshot");

    return {
      logoMediaId: logo?.hfMediaId ?? undefined,
      screenshotMediaIds: screenshots.map(s => s.hfMediaId!).filter(Boolean),
    };
  } catch (err) {
    if (isTerminalProviderError(err)) {
      throw err;
    }
    console.warn(`[higgsfield] batch upload failed:`, err);
    return { logoMediaId: undefined, screenshotMediaIds: [] };
  }
}
