import * as cheerio from "cheerio";
import postcss from "postcss";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { db, schema } from "@/lib/db";
import { normalizeProfile, type ProductProfile } from "@/lib/brain/types";
import { resolveFont } from "@/lib/compose/fonts";

export interface FontSpec {
  family: string;
  class: "serif" | "sans" | "display" | "mono";
  source: "fontsource" | "google" | "site" | "substitute";
  file?: string;
  weights: number[];
}

export interface BrandKit {
  palette: { bg: string; surface: string; ink: string; muted: string; accents: string[]; onAccent: string };
  type: { display: FontSpec; body: FontSpec };
  logo: { src?: string; mark?: string };
  icons: { style: "line" | "solid" | "geometric" };
  shape: { radius: number; density: "airy" | "balanced" | "tight" };
  photo: { treatment: "none" | "warm" | "duotone" };
  mood: string[];
  source: { from: "landingUrl" | "profile" | "upload" | "derived"; at: number; fontNote?: string };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Pull hex colors out of a freeform "colors" string (e.g. "navy #0B0F1A and coral"). */
export function parseHexFromText(text: string): string[] {
  const out: string[] = [];
  const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(expandHex(m[0]));
  }
  return out;
}

function expandHex(h: string): string {
  if (h.length === 4) {
    return "#" + h.slice(1).split("").map((c) => c + c).join("").toUpperCase();
  }
  return h.toUpperCase();
}

/** density from visual style keywords */
export function densityFromStyle(style: string): "airy" | "balanced" | "tight" {
  const s = style.toLowerCase();
  if (/(airy|spacious|open|breathable|generous)/.test(s)) return "airy";
  if (/(minimal|dense|compact|tight|packed|utilitarian)/.test(s)) return "tight";
  return "balanced";
}

/** icon style from style + mood/personality keywords */
export function iconStyleFromTraits(style: string, mood: string): "line" | "solid" | "geometric" {
  const s = (style + " " + mood).toLowerCase();
  if (/(geometric|brutalist|grid|technical|angular)/.test(s)) return "geometric";
  if (/(bold|playful|fun|energetic|vibrant|loud|chunky)/.test(s)) return "solid";
  return "line";
}

/** corner radius from style */
export function radiusFromStyle(style: string): number {
  const s = style.toLowerCase();
  if (/(sharp|brutalist|angular|hard|square)/.test(s)) return 0;
  if (/(rounded|soft|friendly|pill|bubbly)/.test(s)) return 24;
  if (/(minimal|clean|modern)/.test(s)) return 8;
  return 12;
}

/** photo treatment from mood */
export function treatmentFromMood(mood: string): "none" | "warm" | "duotone" {
  const m = mood.toLowerCase();
  if (/(warm|cozy|earthy|sunset|inviting)/.test(m)) return "warm";
  if (/(bold|graphic|striking|editorial|moody|high-contrast)/.test(m)) return "duotone";
  return "none";
}

function moodWords(profile: ProductProfile): string[] {
  const raw = `${profile.visualIdentity.mood} ${profile.tone} ${(profile.brandPersonality?.traits || []).join(" ")}`;
  const words = raw
    .toLowerCase()
    .split(/[\s,;./]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  return Array.from(new Set(words)).slice(0, 6);
}

const DEFAULT_DISPLAY: FontSpec = { family: "Sora", class: "display", source: "substitute", weights: [700] };
const DEFAULT_BODY: FontSpec = { family: "Inter", class: "sans", source: "substitute", weights: [400, 600] };

/** Validate the LLM-extracted structured palette (all 6 fields present + hex). */
function validStructuredPalette(p: unknown): p is BrandKit["palette"] {
  if (!p || typeof p !== "object") return false;
  const q = p as Record<string, unknown>;
  const hex = (v: unknown) => typeof v === "string" && HEX.test(v);
  return (
    hex(q.bg) && hex(q.surface) && hex(q.ink) && hex(q.muted) && hex(q.onAccent) &&
    Array.isArray(q.accents) && q.accents.length > 0 && (q.accents as unknown[]).every(hex)
  );
}

/** Map an extracted {family,class} font hint to a FontSpec (resolveFont substitutes by class if needed). */
function structuredFontToSpec(f: { family?: string; class?: string } | undefined, fallback: FontSpec): FontSpec {
  if (!f || !f.class) return { ...fallback };
  const klass = (["serif", "sans", "display", "mono"].includes(f.class) ? f.class : fallback.class) as FontSpec["class"];
  return { family: f.family || fallback.family, class: klass, source: "substitute", weights: fallback.weights };
}

/**
 * Derive a BrandKit from the profile. Prefers the LLM-extracted structured visual
 * identity (real palette/fonts/treatment grounded in site + screenshots). Falls back
 * to prose-parsed accents over a neutral light scaffold only when structure is absent.
 */
export function coldStartBrandKit(profile: ProductProfile): BrandKit {
  const vi = profile.visualIdentity;
  const style = vi.style || "";
  const mood = vi.mood || "";

  let palette: BrandKit["palette"];
  if (validStructuredPalette(vi.palette)) {
    palette = vi.palette;
  } else {
    const found = parseHexFromText(vi.colors || "");
    // Neutral LIGHT scaffold (not an always-dark theme) when we have no real colors.
    palette = {
      bg: "#FAFAF7",
      surface: "#FFFFFF",
      ink: "#1A1A1A",
      muted: "#6B6B6B",
      accents: found.length > 0 ? found : ["#2563EB"],
      onAccent: "#FFFFFF",
    };
  }

  const type = {
    display: structuredFontToSpec(vi.fonts?.display, DEFAULT_DISPLAY),
    body: structuredFontToSpec(vi.fonts?.body, DEFAULT_BODY),
  };

  return {
    palette,
    type,
    logo: {},
    icons: { style: iconStyleFromTraits(style, mood) },
    shape: { radius: radiusFromStyle(style), density: densityFromStyle(style) },
    photo: { treatment: vi.treatment || treatmentFromMood(mood) },
    mood: moodWords(profile),
    source: { from: "derived", at: Date.now() },
  };
}

function isBrandKit(v: unknown): v is BrandKit {
  if (!v || typeof v !== "object") return false;
  const k = v as Partial<BrandKit>;
  return (
    !!k.palette &&
    typeof k.palette === "object" &&
    typeof (k.palette as BrandKit["palette"]).bg === "string" &&
    Array.isArray((k.palette as BrandKit["palette"]).accents) &&
    !!k.type &&
    !!k.source
  );
}

/** Read + validate the cached BrandKit off a product row. Tolerates json-mode (object) or text (string). */
export function getCachedBrandKit(product: schema.Product): BrandKit | null {
  const raw = (product as { brandKit?: unknown }).brandKit;
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return isBrandKit(parsed) ? parsed : null;
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Collect every hex color appearing in inline <style> blocks (custom props + rules), deduped + uppercased. */
export function extractCssHexColors(html: string): string[] {
  const $ = cheerio.load(html);
  const css = $("style")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");
  const out: string[] = [];
  const seen = new Set<string>();
  try {
    const root = postcss.parse(css);
    root.walkDecls((decl) => {
      for (const h of parseHexFromText(decl.value)) {
        if (!seen.has(h)) { seen.add(h); out.push(h); }
      }
    });
  } catch {
    // postcss parse failure -> fall back to raw regex over the css blob
  }
  for (const h of parseHexFromText(css)) {
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

/** og:image as an absolute URL, or null. */
export function extractOgImage(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:image"]').attr("content")
    || $('meta[name="og:image"]').attr("content")
    || $('meta[name="twitter:image"]').attr("content");
  return og ? absoluteUrl(og, baseUrl) : null;
}

/** Ordered logo/mark candidates (best-first): og:image, apple-touch-icon, icon links, inline logo imgs. */
export function extractLogoCandidates(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  const push = (href?: string | null) => {
    const abs = href ? absoluteUrl(href, baseUrl) : null;
    if (abs && !out.includes(abs)) out.push(abs);
  };
  push($('meta[property="og:image"]').attr("content"));
  push($('link[rel="apple-touch-icon"]').attr("href"));
  $('link[rel~="icon"]').each((_, el) => push($(el).attr("href")));
  $('img[class*="logo" i], img[alt*="logo" i], img[id*="logo" i]').each((_, el) => push($(el).attr("src")));
  return out;
}

export interface ExtractedFonts {
  display?: string;
  body?: string;
  googleFonts: string[];
  fontFace: string[];
}

function firstFamily(value: string): string | undefined {
  const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first) return undefined;
  const generic = ["serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy", "inherit", "initial"];
  return generic.includes(first.toLowerCase()) ? undefined : first;
}

/** Parse font-family from heading/body CSS rules + google-fonts <link> + @font-face. */
export function extractFontFamilies(html: string): ExtractedFonts {
  const $ = cheerio.load(html);
  const css = $("style").map((_, el) => $(el).html() || "").get().join("\n");

  let display: string | undefined;
  let body: string | undefined;
  const fontFace: string[] = [];

  try {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      const sel = rule.selector.toLowerCase();
      const isHeading = /(^|[\s,])(h1|h2|h3|\.display|\.heading|\.title)/.test(sel);
      const isBody = /(^|[\s,])(body|html|p|\.body)/.test(sel);
      rule.walkDecls("font-family", (decl) => {
        const fam = firstFamily(decl.value);
        if (!fam) return;
        if (isHeading && !display) display = fam;
        else if (isBody && !body) body = fam;
      });
    });
    root.walkAtRules("font-face", (at) => {
      at.walkDecls("font-family", (decl) => {
        const fam = firstFamily(decl.value);
        if (fam && !fontFace.includes(fam)) fontFace.push(fam);
      });
    });
  } catch {
    // ignore CSS parse errors; google-fonts link below still works
  }

  const googleFonts: string[] = [];
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const re = /family=([^&]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(href)) !== null) {
      const fam = decodeURIComponent(m[1]).split(":")[0].replace(/\+/g, " ").trim();
      if (fam && !googleFonts.includes(fam)) googleFonts.push(fam);
    }
  });

  if (!display && googleFonts[0]) display = googleFonts[0];
  if (!body && googleFonts[1]) body = googleFonts[1];

  return { display, body, googleFonts, fontFace };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance 0..1. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function bestTextOn(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? "#0B0F1A" : "#FFFFFF";
}

function darken(hex: string, amt: number): string {
  const rgb = hexToRgb(hex).map((c) => Math.max(0, Math.round(c * (1 - amt))));
  return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function lighten(hex: string, amt: number): string {
  const rgb = hexToRgb(hex).map((c) => Math.min(255, Math.round(c + (255 - c) * amt)));
  return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Map an unordered hex list into a structured palette. Returns null if empty. */
export function buildPalette(hexes: string[]): BrandKit["palette"] | null {
  const colors = Array.from(new Set(hexes.map(expandHex))).filter((h) => HEX.test(h));
  if (colors.length === 0) return null;

  // Single brand color: keep it as the accent and derive a dark neutral scaffold around it.
  if (colors.length === 1) {
    const accent = colors[0];
    const bg = darken(accent, 0.92);
    return {
      bg,
      surface: lighten(bg, 0.08),
      ink: lighten(accent, 0.85),
      muted: lighten(bg, 0.45),
      accents: [accent],
      onAccent: bestTextOn(accent),
    };
  }

  const byLum = [...colors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const bg = byLum[0];
  const ink = byLum[byLum.length - 1] !== bg ? byLum[byLum.length - 1] : lighten(bg, 0.9);
  const surface = colors.length > 2 ? darken(ink, 0.85) : lighten(bg, 0.08);
  const muted = lighten(bg, 0.45);

  // accents = most saturated colors that aren't bg/ink, fallback to bg-derived
  const accents = [...colors]
    .filter((c) => c !== bg && c !== ink)
    .sort((a, b) => saturation(b) - saturation(a))
    .slice(0, 3);
  if (accents.length === 0) accents.push(saturation(ink) > saturation(bg) ? ink : lighten(bg, 0.6));

  return { bg, surface, ink, muted, accents, onAccent: bestTextOn(accents[0]) };
}

function fontClass(family: string): FontSpec["class"] {
  const f = family.toLowerCase();
  if (/(mono|code|consolas|courier)/.test(f)) return "mono";
  if (/(serif|georgia|times|playfair|lora|merriweather|garamond)/.test(f)) return "serif";
  return "sans";
}

/** Build display+body FontSpecs from extracted families, tagging source (site vs google vs substitute). */
export function buildFontSpecs(fonts: ExtractedFonts): BrandKit["type"] {
  const known = new Set([...fonts.googleFonts, ...fonts.fontFace]);
  const mk = (family: string | undefined, role: "display" | "body"): FontSpec => {
    if (!family) return role === "display" ? { ...DEFAULT_DISPLAY } : { ...DEFAULT_BODY };
    const source: FontSpec["source"] = fonts.fontFace.includes(family) || known.has(family) ? "site" : "google";
    const klass = role === "display" ? "display" : fontClass(family);
    return {
      family,
      class: klass,
      source: fonts.googleFonts.includes(family) && !fonts.fontFace.includes(family) ? "google" : source,
      weights: role === "display" ? [700] : [400, 600],
    };
  };
  return { display: mk(fonts.display, "display"), body: mk(fonts.body, "body") };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; BuzzBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function paletteFromImage(imageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return [];
    const buf = Buffer.from(await res.arrayBuffer());
    // normalize to png so Vibrant/sharp can decode svg/webp/ico variants
    const png = await sharp(buf).resize(200, 200, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const { Vibrant } = await import("node-vibrant/node");
    const swatches = await Vibrant.from(png).getPalette();
    return Object.values(swatches)
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => s.hex.toUpperCase());
  } catch {
    return [];
  }
}

async function attachFontData(kit: BrandKit): Promise<void> {
  for (const spec of [kit.type.display, kit.type.body]) {
    try {
      const resolved = await resolveFont(spec.family, spec.class, spec.weights[0]);
      spec.file = resolved.filePath;
      spec.source = resolved.source;
    } catch {
      // keep the family name; downstream renderer falls back to substitute
      kit.source.fontNote = `font "${spec.family}" unresolved`;
    }
  }
}

/**
 * Derive a BrandKit for a product from its landing site.
 * Pipeline: fetch HTML -> CSS hex palette (+ og:image/favicon palette via Vibrant) -> logo -> fonts.
 * Any failure degrades gracefully to coldStartBrandKit. NEVER throws.
 */
/** Extract dominant colors from a locally-stored screenshot ("/api/media/screenshots/x.png"). */
async function paletteFromScreenshot(mediaPath: string): Promise<string[]> {
  try {
    const rel = mediaPath.replace(/^\/api\/media\//, "");
    const file = pathJoin(process.cwd(), "public", "media", rel);
    const buf = await readFile(file);
    const png = await sharp(buf).resize(240, 240, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const { Vibrant } = await import("node-vibrant/node");
    const swatches = await Vibrant.from(png).getPalette();
    return Object.values(swatches).filter((s): s is NonNullable<typeof s> => !!s).map((s) => s.hex.toUpperCase());
  } catch {
    return [];
  }
}

export async function deriveBrandKit(productId: number): Promise<BrandKit> {
  let profile: ProductProfile;
  let landingUrl: string | null = null;
  let screenshots: string[] = [];

  try {
    const product = await db.select().from(schema.products).where(eq(schema.products.id, productId)).get();
    landingUrl = (product?.landingUrl as string | null) ?? null;
    screenshots = product?.screenshots ? JSON.parse(product.screenshots as string) : [];
    const rawProfile = product?.profile;
    profile = rawProfile
      ? normalizeProfile(typeof rawProfile === "string" ? JSON.parse(rawProfile) : (rawProfile as Record<string, unknown>))
      : normalizeProfile({});
  } catch {
    return coldStartBrandKit(normalizeProfile({}));
  }

  const base = coldStartBrandKit(profile);

  // PRIMARY: the extraction already produced a structured palette/fonts grounded in
  // the site + screenshots. Trust it; just resolve the font files.
  if (validStructuredPalette(profile.visualIdentity.palette)) {
    await attachFontData(base);
    base.source = { from: "profile", at: Date.now(), fontNote: base.source.fontNote };
    return base;
  }

  // FALLBACK (legacy profiles, no structured identity): pull real colors from
  // screenshots and/or the live site, then build a palette.
  try {
    const screenshotColors = screenshots.length ? await paletteFromScreenshot(screenshots[0]) : [];
    let cssHexes: string[] = [];
    let imageColors: string[] = [];
    let logos: string[] = [];
    let siteType: BrandKit["type"] | null = null;

    if (landingUrl) {
      const html = await fetchHtml(landingUrl);
      if (html) {
        cssHexes = extractCssHexColors(html);
        logos = extractLogoCandidates(html, landingUrl);
        const og = extractOgImage(html, landingUrl);
        imageColors = og ? await paletteFromImage(og) : [];
        siteType = buildFontSpecs(extractFontFamilies(html));
      }
    }

    const builtPalette = buildPalette([...screenshotColors, ...cssHexes, ...imageColors]);
    // Only claim a real source if we actually obtained signal; a failed fetch -> "derived".
    const gotSignal = !!builtPalette || logos.length > 0 || !!siteType;
    const kit: BrandKit = {
      palette: builtPalette ?? base.palette,
      type: siteType ?? base.type,
      logo: logos[0] ? { src: logos[0], mark: logos[1] } : base.logo,
      icons: base.icons,
      shape: base.shape,
      photo: base.photo,
      mood: base.mood,
      source: { from: gotSignal ? "landingUrl" : "derived", at: Date.now() },
    };
    await attachFontData(kit);
    return kit;
  } catch {
    await attachFontData(base);
    return base;
  }
}

/**
 * Scrape concise visual + content signals from a landing page, for the extraction
 * LLM to ground profile/strategy/visualIdentity in the real site. Never throws.
 */
export async function fetchLandingSignals(url: string): Promise<string | null> {
  const html = await fetchHtml(url);
  if (!html) return null;
  try {
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    const metaDesc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "").trim();
    const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] || "").trim();
    const cssHexes = extractCssHexColors(html).slice(0, 12);
    const og = extractOgImage(html, url);
    const imageColors = og ? (await paletteFromImage(og)).slice(0, 6) : [];
    const fonts = extractFontFamilies(html);
    // Visible headline-ish text: strip tags, collapse whitespace, take a slice.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);

    const lines = [
      title && `- Title: ${title}`,
      ogTitle && ogTitle !== title && `- OG title: ${ogTitle}`,
      metaDesc && `- Meta description: ${metaDesc}`,
      cssHexes.length && `- CSS colors: ${cssHexes.join(", ")}`,
      imageColors.length && `- Hero/OG image colors: ${imageColors.join(", ")}`,
      (() => {
        const fams = [fonts.display, fonts.body, ...fonts.googleFonts].filter(Boolean) as string[];
        return fams.length ? `- Fonts referenced: ${Array.from(new Set(fams)).slice(0, 6).join(", ")}` : "";
      })(),
      text && `- Page copy (excerpt): ${text}`,
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  } catch {
    return null;
  }
}

export { HEX };
