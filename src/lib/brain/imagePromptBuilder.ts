import type { ImagePrompt } from "./types";

interface VisualIdentity {
  style?: string;
  colors?: string;
  mood?: string;
}

interface BuildFluxPromptInput {
  imagePrompt: ImagePrompt;
  visualIdentity?: VisualIdentity;
  visualDirection?: string;
}

const STYLE_PHRASES: Record<string, string> = {
  "photo-realistic": "photographic style with natural textures and realistic lighting",
  "illustrated": "digital illustration with clean lines and vibrant fills",
  "minimal-graphic": "minimal flat graphic with bold shapes and negative space",
  "cinematic": "cinematic frame with dramatic depth of field and anamorphic framing",
  "3d-render": "3D render with soft global illumination and subsurface scattering",
  "flat-design": "flat design with geometric shapes and solid color blocks",
};

export function buildFluxPrompt({ imagePrompt, visualIdentity, visualDirection }: BuildFluxPromptInput): string {
  const parts: string[] = [];

  // 1. Scene (front-loaded, as-is from LLM)
  if (imagePrompt.scene) {
    parts.push(imagePrompt.scene);
  }

  // 2. Style as descriptive phrase
  if (imagePrompt.style) {
    const phrase = STYLE_PHRASES[imagePrompt.style] || imagePrompt.style;
    parts.push(`Rendered in ${phrase}.`);
  }

  // 3. Mood as atmosphere sentence
  if (imagePrompt.mood) {
    parts.push(`The atmosphere feels ${imagePrompt.mood}.`);
  }

  // 4. Brand color reinforcement if not already in scene
  const colorInfo = visualIdentity?.colors;
  if (colorInfo && imagePrompt.scene && !imagePrompt.scene.toLowerCase().includes(colorInfo.toLowerCase().split(" ")[0])) {
    parts.push(`Color palette draws from ${colorInfo}.`);
  }

  // 5. Visual direction hint
  if (visualDirection && !imagePrompt.scene?.toLowerCase().includes(visualDirection.toLowerCase().slice(0, 20))) {
    parts.push(`Overall feel: ${visualDirection}.`);
  }

  // 6. Natural-language exclusion
  parts.push("Without any text, lettering, words, watermarks, human figures, people, faces, or hands.");

  // Join and cap at ~85 words
  let result = parts.join(" ");
  const words = result.split(/\s+/);
  if (words.length > 85) {
    result = words.slice(0, 85).join(" ");
  }

  return result;
}
