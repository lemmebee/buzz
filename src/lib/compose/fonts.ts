import { readFile, mkdir, access, writeFile } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { resolve, join } from "node:path";
// @woff2/woff2-rs exposes `decode(Buffer): Buffer` (NOT `decompress`).
import { decode as woff2Decode } from "@woff2/woff2-rs";

export interface ResolvedFont {
  family: string;
  class: "serif" | "sans" | "display" | "mono";
  filePath: string;
  data: Buffer;
  weight: number;
  source: "fontsource" | "google" | "site" | "substitute";
}

/** Project-local on-disk cache for resolved (satori-feedable) font files. */
export const FONTS_CACHE_DIR = "data/fonts-cache";

/** Known family name -> @fontsource package + canonical family. */
const FONTSOURCE: Record<string, { pkg: string; family: string; weights: number[] }> = {
  inter: { pkg: "@fontsource/inter", family: "Inter", weights: [400, 700] },
  "noto serif": { pkg: "@fontsource/noto-serif", family: "Noto Serif", weights: [400, 700] },
  "jetbrains mono": { pkg: "@fontsource/jetbrains-mono", family: "JetBrains Mono", weights: [400, 700] },
};

/** Class -> bundled OFL substitute (must exist as an installed @fontsource pkg). */
const SUBSTITUTE: Record<ResolvedFont["class"], string> = {
  serif: "noto serif",
  sans: "inter",
  display: "inter",
  mono: "jetbrains mono",
};

function normKey(family: string): string {
  return family.trim().toLowerCase();
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function pickWeight(available: number[], want: number): number {
  if (available.includes(want)) return want;
  return available.reduce((best, w) =>
    Math.abs(w - want) < Math.abs(best - want) ? w : best,
  );
}

/**
 * Resolve the @fontsource package root by direct filesystem path.
 * We deliberately avoid require.resolve(): webpack rewrites dynamic
 * require.resolve into an empty context that throws at runtime in Next
 * server bundles. A plain cwd-relative node_modules path is webpack-safe
 * and correct for this repo's flat install layout.
 */
function fontsourcePkgDir(pkg: string): string {
  return join(process.cwd(), "node_modules", pkg);
}

/**
 * Build the on-disk file path for a fontsource static face.
 * v5 layout: files/<slug>-latin-<weight>-normal.woff (+ .woff2).
 * We use the .woff (satori-compatible); .woff2 needs decompression.
 */
function fontsourceWoffPath(pkg: string, weight: number): string {
  const slug = pkg.replace("@fontsource/", "");
  return join(fontsourcePkgDir(pkg), "files", `${slug}-latin-${weight}-normal.woff`);
}

function cacheKey(family: string, weight: number, source: string): string {
  const safe = family.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${source}-${safe}-${weight}.woff`;
}

async function readCache(key: string): Promise<{ filePath: string; data: Buffer } | null> {
  const filePath = resolve(FONTS_CACHE_DIR, key);
  if (await exists(filePath)) {
    return { filePath, data: await readFile(filePath) };
  }
  return null;
}

async function writeCache(key: string, data: Buffer): Promise<string> {
  await mkdir(resolve(FONTS_CACHE_DIR), { recursive: true });
  const filePath = resolve(FONTS_CACHE_DIR, key);
  await writeFile(filePath, data);
  return filePath;
}

async function resolveFontsource(
  entry: { pkg: string; family: string; weights: number[] },
  klass: ResolvedFont["class"],
  weight: number,
  source: ResolvedFont["source"],
): Promise<ResolvedFont> {
  const w = pickWeight(entry.weights, weight);
  const key = cacheKey(entry.family, w, source);

  const cached = await readCache(key);
  if (cached) {
    return { family: entry.family, class: klass, filePath: cached.filePath, data: cached.data, weight: w, source };
  }

  const woffPath = fontsourceWoffPath(entry.pkg, w);
  const data = await readFile(woffPath);
  const filePath = await writeCache(key, data);
  return { family: entry.family, class: klass, filePath, data, weight: w, source };
}

/**
 * Decompress a WOFF2 buffer into a satori-feedable TTF/OTF (sfnt) buffer.
 * @woff2/woff2-rs's `decode` returns a Buffer; we validate the input magic.
 */
export function decompressWoff2ToTtf(woff2: Buffer): Buffer {
  if (woff2.toString("ascii", 0, 4) !== "wOF2") {
    throw new Error("decompressWoff2ToTtf: input is not a WOFF2 buffer");
  }
  return Buffer.from(woff2Decode(woff2));
}

/**
 * Resolve a font face to a satori-feedable buffer.
 *
 * Strategy:
 *  1. If `familyName` maps to an installed @fontsource package, read its WOFF.
 *  2. Else if a `woff2Url` is given, fetch + decompress via @woff2/woff2-rs -> TTF.
 *  3. Else substitute a bundled OFL font by class.
 * Resolved buffers are cached on disk under FONTS_CACHE_DIR.
 */
export async function resolveFont(
  familyName: string,
  klass: "serif" | "sans" | "display" | "mono",
  weight = 400,
  woff2Url?: string,
): Promise<ResolvedFont> {
  const direct = FONTSOURCE[normKey(familyName)];
  if (direct) {
    return resolveFontsource(direct, klass, weight, "fontsource");
  }

  if (woff2Url) {
    const key = cacheKey(familyName, weight, "google");
    const cached = await readCache(key);
    if (cached) {
      return { family: familyName, class: klass, filePath: cached.filePath, data: cached.data, weight, source: "google" };
    }
    const res = await fetch(woff2Url);
    if (!res.ok) throw new Error(`resolveFont: woff2 fetch ${res.status} for ${woff2Url}`);
    const ttf = decompressWoff2ToTtf(Buffer.from(await res.arrayBuffer()));
    const filePath = await writeCache(key, ttf);
    return { family: familyName, class: klass, filePath, data: ttf, weight, source: "google" };
  }

  // Unknown family: substitute a bundled OFL font for the class.
  const subEntry = FONTSOURCE[SUBSTITUTE[klass]];
  return resolveFontsource(subEntry, klass, weight, "substitute");
}
