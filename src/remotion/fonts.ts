// Curated, headless-safe Google fonts. Loaded once at module scope so the
// render process has them ready; the spec's font enum maps 1:1 to this map.
//
// Deliberately NOT the LLM-monoculture defaults (Inter, Roboto, Poppins,
// Open Sans, Lato, Playfair) — those are an instant "AI made this" tell. The set
// is condensed grotesques for display, a distinctive geometric grotesque for
// body, a mono, and one expressive serif, so hero/kicker pairings can cross the
// serif↔sans / sans↔mono boundary instead of stacking two lookalike sans faces.
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as chivo } from "@remotion/google-fonts/Chivo";
import { loadFont as archivo } from "@remotion/google-fonts/Archivo";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as oswald } from "@remotion/google-fonts/Oswald";
import { loadFont as bebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as archivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as spaceMono } from "@remotion/google-fonts/SpaceMono";
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";

// Each loadFont has its own font-specific generic signature, so type them down
// to the only shape we use here.
type Loader = (
  style: "normal",
  options: { weights: string[]; subsets: string[]; ignoreTooManyRequestsWarning: boolean }
) => { fontFamily: string };

// Load ONLY the normal style + latin subset + the weights we render (regular +
// heavy), clamped to what each font actually ships (loadFont throws on an
// unavailable weight). Single-weight display faces only have 400.
const FONT_LOADERS: { load: Loader; weights: string[] }[] = [
  { load: spaceGrotesk as unknown as Loader, weights: ["400", "700"] }, // max 700
  { load: chivo as unknown as Loader, weights: ["400", "800"] },
  { load: archivo as unknown as Loader, weights: ["400", "800"] },
  { load: montserrat as unknown as Loader, weights: ["400", "800"] },
  { load: oswald as unknown as Loader, weights: ["400", "700"] }, // max 700
  { load: bebas as unknown as Loader, weights: ["400"] },
  { load: anton as unknown as Loader, weights: ["400"] },
  { load: archivoBlack as unknown as Loader, weights: ["400"] },
  { load: spaceMono as unknown as Loader, weights: ["400", "700"] }, // max 700
  { load: fraunces as unknown as Loader, weights: ["400", "800"] },
];

// family name -> loaded CSS font-family string
const familyMap: Record<string, string> = {};
for (const { load, weights } of FONT_LOADERS) {
  const { fontFamily } = load("normal", { weights, subsets: ["latin"], ignoreTooManyRequestsWarning: true });
  familyMap[fontFamily] = fontFamily;
}

const DEFAULT_FAMILY = "Space Grotesk";

// Resolve a spec font name to a loaded family, defaulting to a distinctive
// grotesque rather than the training-data default.
export function fontStack(family: string | undefined): string {
  const resolved = family && familyMap[family] ? familyMap[family] : DEFAULT_FAMILY;
  const isSerif = resolved === "Fraunces";
  const isMono = resolved === "Space Mono";
  return `"${resolved}", ${isMono ? "monospace" : isSerif ? "serif" : "sans-serif"}`;
}

// Heaviest weight each family actually ships. Asking for 800 from a font that
// only has 400 makes the browser synthesize a smeared faux-bold, so display
// faces must be rendered at their real weight.
const MAX_WEIGHT: Record<string, number> = {
  SpaceGrotesk: 700,
  Chivo: 800,
  Archivo: 800,
  Montserrat: 800,
  Oswald: 700,
  BebasNeue: 400,
  Anton: 400,
  ArchivoBlack: 400,
  SpaceMono: 700,
  Fraunces: 800,
};

export function fontWeight(family: string | undefined): number {
  if (!family) return MAX_WEIGHT[DEFAULT_FAMILY.replace(/\s+/g, "")];
  return MAX_WEIGHT[family.replace(/\s+/g, "")] ?? 700;
}
