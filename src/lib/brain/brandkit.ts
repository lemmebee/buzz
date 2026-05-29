import type { ProductProfile } from "@/lib/brain/types";
import type { schema } from "@/lib/db";

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

export { HEX };
