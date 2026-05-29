import { readFile, mkdir, access, writeFile } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
 * Resolve the @fontsource package root via its package.json so we don't
 * depend on cwd or hoisting layout.
 */
function fontsourcePkgDir(pkg: string): string {
  const pj = require.resolve(`${pkg}/package.json`);
  return pj.slice(0, pj.length - "/package.json".length);
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
 * Resolve a font face to a satori-feedable buffer.
 *
 * Strategy:
 *  1. If `familyName` maps to an installed @fontsource package, read its WOFF.
 *  2. Else (future) decompress a known woff2 URL via @woff2/woff2-rs -> TTF.
 *  3. Else substitute a bundled OFL font by class.
 * Resolved buffers are cached on disk under FONTS_CACHE_DIR.
 */
export async function resolveFont(
  familyName: string,
  klass: "serif" | "sans" | "display" | "mono",
  weight = 400,
): Promise<ResolvedFont> {
  const direct = FONTSOURCE[normKey(familyName)];
  if (direct) {
    return resolveFontsource(direct, klass, weight, "fontsource");
  }

  // Unknown family: substitute a bundled OFL font for the class.
  const subEntry = FONTSOURCE[SUBSTITUTE[klass]];
  return resolveFontsource(subEntry, klass, weight, "substitute");
}
