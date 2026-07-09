// Curated, headless-safe Google fonts. Loaded once at module scope so the
// render process has them ready; the spec's font enum maps 1:1 to this map.
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as oswald } from "@remotion/google-fonts/Oswald";
import { loadFont as bebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as archivo } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as playfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as roboto } from "@remotion/google-fonts/Roboto";

// Each loadFont has its own font-specific generic signature, so type them down
// to the only shape we use here.
type Loader = (
  style: "normal",
  options: { weights: string[]; subsets: string[]; ignoreTooManyRequestsWarning: boolean }
) => { fontFamily: string };

// Load ONLY the normal style + latin subset + the weights SpecVideo renders
// (regular 400 and bold ~800), clamped to what each font actually ships
// (loadFont throws on an unavailable weight). Previously every weight/subset of
// both styles loaded, firing 60-160 network requests per font on each headless
// render — slow and noisy. Single-weight display fonts only have 400.
const FONT_LOADERS: { load: Loader; weights: string[] }[] = [
  { load: inter as unknown as Loader, weights: ["400", "800"] },
  { load: montserrat as unknown as Loader, weights: ["400", "800"] },
  { load: poppins as unknown as Loader, weights: ["400", "800"] },
  { load: oswald as unknown as Loader, weights: ["400", "700"] }, // max weight 700
  { load: bebas as unknown as Loader, weights: ["400"] },
  { load: anton as unknown as Loader, weights: ["400"] },
  { load: archivo as unknown as Loader, weights: ["400"] },
  { load: playfair as unknown as Loader, weights: ["400", "800"] },
  { load: roboto as unknown as Loader, weights: ["400", "800"] },
];

// family name -> loaded CSS font-family string
const familyMap: Record<string, string> = {};
for (const { load, weights } of FONT_LOADERS) {
  const { fontFamily } = load("normal", { weights, subsets: ["latin"], ignoreTooManyRequestsWarning: true });
  familyMap[fontFamily] = fontFamily;
}

// Resolve a spec font name to a loaded family, defaulting to Inter.
export function fontStack(family: string | undefined): string {
  const resolved = family && familyMap[family] ? familyMap[family] : "Inter";
  return `"${resolved}", sans-serif`;
}

// Heaviest weight each family actually ships. Asking for 800 from a font that
// only has 400 makes the browser synthesize a smeared faux-bold, so display
// faces must be rendered at their real weight.
const MAX_WEIGHT: Record<string, number> = {
  Inter: 800,
  Montserrat: 800,
  Poppins: 800,
  PlayfairDisplay: 800,
  Roboto: 800,
  Oswald: 700,
  BebasNeue: 400,
  Anton: 400,
  ArchivoBlack: 400,
};

export function fontWeight(family: string | undefined): number {
  if (!family) return 800;
  return MAX_WEIGHT[family.replace(/\s+/g, "")] ?? 800;
}
