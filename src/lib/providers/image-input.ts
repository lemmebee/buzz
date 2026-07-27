import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Image references reaching a TextProvider come in three shapes:
//   • data: URI                  (inline base64)
//   • /api/media/<file>          (served URL — lives at public/media/<file>)
//   • /abs/path or media/<file>  (filesystem path, absolute or relative to public/)
// Providers need them as either an absolute file path (CLI providers) or
// inline base64 + mime type (SDK providers). These helpers cover both.

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface InlineImage {
  mimeType: string;
  data: string;
}

function mimeForPath(p: string): string {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] ?? "image/png";
}

function parseDataUri(ref: string): InlineImage | null {
  const m = ref.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

// Callers (the generate route, extraction, the image orchestrator) have all at
// some point handed over bare base64 with no data: prefix. That resolved to
// null everywhere and the model silently received no images at all, so treat a
// bare payload as an image and sniff its type from the magic bytes.
function parseBareBase64(ref: string): InlineImage | null {
  if (ref.length < 256 || /[^A-Za-z0-9+/=\s]/.test(ref.slice(0, 512))) return null;

  let head: Buffer;
  try {
    head = Buffer.from(ref.slice(0, 32), "base64");
  } catch {
    return null;
  }

  const mimeType =
    head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg"
    : head[0] === 0x89 && head[1] === 0x50 ? "image/png"
    : head.subarray(8, 12).toString("ascii") === "WEBP" ? "image/webp"
    : head[0] === 0x47 && head[1] === 0x49 ? "image/gif"
    : null;

  return mimeType ? { mimeType, data: ref } : null;
}

// Resolve a non-data reference to an existing absolute path, or null.
export function toAbsolutePath(ref: string): string | null {
  if (ref.startsWith("data:")) return null;
  // Strip the served-URL prefix first: "/api/media/x.jpg" is not a real path.
  const rel = ref.replace(/^\/api\/media\//, "media/");
  const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), "public", rel);
  return existsSync(abs) ? abs : null;
}

// Absolute path for any reference. data: URIs are spilled to a temp file so
// CLI providers, which can only take paths, don't silently drop them.
export function materializeToFile(ref: string): string | null {
  const abs = toAbsolutePath(ref);
  if (abs) return abs;

  const inline = parseDataUri(ref) ?? parseBareBase64(ref);
  if (!inline) return null;

  const ext = Object.entries(MIME_BY_EXT).find(([, m]) => m === inline.mimeType)?.[0] ?? ".png";
  const dir = mkdtempSync(path.join(tmpdir(), "buzz-img-"));
  const file = path.join(dir, `image${ext}`);
  writeFileSync(file, Buffer.from(inline.data, "base64"));
  return file;
}

// Inline base64 + correct mime for any reference.
export function toInlineImage(ref: string): InlineImage | null {
  const inline = parseDataUri(ref);
  if (inline) return inline;

  const abs = toAbsolutePath(ref);
  if (!abs) return parseBareBase64(ref);
  return { mimeType: mimeForPath(abs), data: readFileSync(abs).toString("base64") };
}

// Unique parent directories, for CLIs that must be granted workspace access.
export function parentDirs(paths: string[]): string[] {
  return Array.from(new Set(paths.map((p) => path.dirname(p))));
}
