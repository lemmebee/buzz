import type { ProductProfile } from "@/lib/brain/types";
import type { schema } from "@/lib/db";
import * as cheerio from "cheerio";
import postcss from "postcss";

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

/** Derive a sane BrandKit purely from the profile when no site is available. */
export function coldStartBrandKit(profile: ProductProfile): BrandKit {
  const style = profile.visualIdentity.style || "";
  const mood = profile.visualIdentity.mood || "";

  const found = parseHexFromText(profile.visualIdentity.colors || "");
  const accents = found.length > 0 ? found : ["#FF5A36", "#36C2FF"];

  return {
    palette: {
      bg: "#0B0F1A",
      surface: "#161B2E",
      ink: "#F5F7FF",
      muted: "#9AA3B2",
      accents,
      onAccent: "#FFFFFF",
    },
    type: { display: { ...DEFAULT_DISPLAY }, body: { ...DEFAULT_BODY } },
    logo: {},
    icons: { style: iconStyleFromTraits(style, mood) },
    shape: { radius: radiusFromStyle(style), density: densityFromStyle(style) },
    photo: { treatment: treatmentFromMood(mood) },
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

export { HEX };
