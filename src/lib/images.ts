import sharp from "sharp";
import { readFile } from "fs/promises";
import { join } from "path";

const MAX_IMAGES = 4;
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;
const JPEG_QUALITY = 70;

export interface PreparedImage {
  base64: string;
  originalPath: string;
}

/**
 * Load, resize, compress, and limit images for AI provider consumption.
 * Picks evenly-spaced images when count exceeds MAX_IMAGES.
 */
export async function prepareImages(
  paths: string[],
  opts?: { maxImages?: number; maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<PreparedImage[]> {
  const maxImages = opts?.maxImages ?? MAX_IMAGES;
  const maxWidth = opts?.maxWidth ?? MAX_WIDTH;
  const maxHeight = opts?.maxHeight ?? MAX_HEIGHT;
  const quality = opts?.quality ?? JPEG_QUALITY;

  // Pick evenly-spaced subset if too many
  const selected = paths.length <= maxImages
    ? paths
    : pickSpaced(paths, maxImages);

  const results: PreparedImage[] = [];
  for (const p of selected) {
    try {
      const absPath = p.startsWith("/") ? p : join(process.cwd(), "public", p);
      const buffer = await readFile(absPath);
      const compressed = await sharp(buffer)
        .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      results.push({ base64: compressed.toString("base64"), originalPath: p });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

/** Pick n evenly-spaced items from arr */
function pickSpaced<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}
