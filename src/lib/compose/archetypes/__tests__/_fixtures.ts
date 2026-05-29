import type { BrandKit } from "@/lib/brain/brandkit";
import type { Brief, ArchetypeId } from "@/lib/compose/archetypes/types";

export const KIT: BrandKit = {
  palette: { bg: "#0b0b0b", surface: "#161616", ink: "#ffffff", muted: "#9a9a9a", accents: ["#ff3366", "#33ccff"], onAccent: "#000000" },
  type: {
    display: { family: "Fraunces", class: "display", source: "fontsource", weights: [700, 900] },
    body: { family: "Inter", class: "sans", source: "fontsource", weights: [400, 600] },
  },
  logo: { src: "/api/media/logo.png" },
  icons: { style: "line" },
  shape: { radius: 24, density: "balanced" },
  photo: { treatment: "none" },
  mood: ["bold", "modern"],
  source: { from: "derived", at: 0 },
};

export function makeBrief(archetype: ArchetypeId, over: Partial<Brief> = {}): Brief {
  return {
    archetype,
    headline: "Stop guessing what to post",
    subhead: "A system that picks the angle for you",
    body: "Pick a product. Get a week of posts. Edit one tap. Ship.",
    imagery: { kind: "gradient", scene: "abstract waves" },
    accentIndex: 0,
    caption: "caption text",
    hashtags: ["#growth", "#marketing"],
    ...over,
  };
}
