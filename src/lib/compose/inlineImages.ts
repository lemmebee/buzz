import { readFile } from "fs/promises";
import { join } from "path";
import type { Scene, Background, SceneElement } from "@/lib/compose/scene";

// satori 0.26 cannot load images from relative paths (/api/media/...) or auth-gated
// remote URLs: it requires `data:` URIs or directly fetchable absolute URLs. We inline
// every image src in a Scene to a `data:` URI BEFORE handing the scene to satori.
//
// Resolution rules per src:
//   - starts with "data:"        -> leave as-is.
//   - starts with "/api/media/"  -> read public/media/<filename> off disk -> data: URI.
//   - absolute http(s) URL       -> fetch -> buffer -> data: URI.
//   - empty / unrecognized       -> leave as-is (sceneToSatori already skips empty src).
// Any failure (missing file, fetch error) DROPS the image (src -> "") so the existing
// empty-src guard skips it. We never throw: a missing photo must not fail the whole render.

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "image/jpeg";
}

// Sniff mime from magic bytes; falls back to the filename-derived mime.
function mimeFromBuffer(buf: Buffer, fallback: string): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (buf.length >= 6 && buf.toString("ascii", 0, 6).startsWith("GIF8")) return "image/gif";
  return fallback;
}

/**
 * Resolve a single image src to a `data:` URI. Returns null when the src could not be
 * inlined (caller should drop the image so the empty-src guard skips it). Leaves empty
 * and already-inlined srcs to the caller (returns them unchanged via the early branches).
 */
async function inlineSrc(src: string): Promise<string | null> {
  if (!src) return src; // empty -> leave; guard skips it later
  if (src.startsWith("data:")) return src; // already inlined

  try {
    if (src.startsWith("/api/media/")) {
      const filename = src.replace(/^\/api\/media\//, "");
      const filePath = join(process.cwd(), "public", "media", filename);
      const buf = await readFile(filePath);
      const mime = mimeFromBuffer(buf, mimeFromName(filename));
      return `data:${mime};base64,${buf.toString("base64")}`;
    }

    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`fetch ${src} -> ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mime = mimeFromBuffer(buf, headerMime || mimeFromName(src));
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  } catch (err) {
    console.error("[inlineImages] failed to inline image, dropping:", src, err);
    return null; // signal: drop this image
  }

  // Unrecognized scheme (e.g. raw prompt text or a path we don't serve): drop it so it
  // never reaches satori as a bogus src.
  console.error("[inlineImages] unrecognized image src, dropping:", src);
  return null;
}

async function inlineBackground(bg: Background): Promise<Background> {
  if (bg.kind !== "image") return bg;
  const resolved = await inlineSrc(bg.src);
  // null (failed/unrecognized) -> empty src so backgroundLayers degrades to no layer.
  return { ...bg, src: resolved ?? "" };
}

async function inlineElement(el: SceneElement): Promise<SceneElement> {
  if (el.type !== "image" && el.type !== "logo") return el;
  const resolved = await inlineSrc(el.src);
  // null (failed/unrecognized) -> empty src so sceneToSatori's guard skips the node.
  return { ...el, src: resolved ?? "" };
}

/**
 * Return a copy of the scene with every image src (background-image, image/logo elements)
 * replaced by a `data:` URI. Failures drop the image (empty src) rather than throw.
 * Solid/gradient backgrounds and non-image elements pass through untouched.
 */
export async function inlineSceneImages(scene: Scene): Promise<Scene> {
  const [background, elements] = await Promise.all([
    inlineBackground(scene.background),
    Promise.all(scene.elements.map(inlineElement)),
  ]);
  return { ...scene, background, elements };
}
