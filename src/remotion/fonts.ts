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

// Each loadFont has its own font-specific generic signature, so type the array
// down to the only shape we use here.
const loaders = [inter, montserrat, poppins, oswald, bebas, anton, archivo, playfair, roboto] as unknown as Array<
  () => { fontFamily: string }
>;

// family name -> loaded CSS font-family string
const familyMap: Record<string, string> = {};
for (const load of loaders) {
  const { fontFamily } = load();
  familyMap[fontFamily] = fontFamily;
}

// Resolve a spec font name to a loaded family, defaulting to Inter.
export function fontStack(family: string | undefined): string {
  const resolved = family && familyMap[family] ? familyMap[family] : "Inter";
  return `"${resolved}", sans-serif`;
}
