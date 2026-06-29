// Shape of the inputProps the buzz Remotion provider passes into <BuzzVideo>.
// The provider (src/lib/providers/video-remotion.ts) builds this from a
// VideoGenerationInput; the composition reads it via props + calculateMetadata.

export interface RemotionScene {
  // staticFile-relative path under public/, e.g. "media/hf-123.jpg"
  src: string;
  durationInFrames: number;
}

export interface RemotionCaption {
  text: string;
  startMs: number;
  endMs: number;
}

export interface RemotionBranding {
  // Resolved CSS colors (hex/named). Provider resolves free-text brand colors
  // to these before they reach the composition.
  bgColor: string;
  accentColor: string;
  handle?: string;
  // data:image/...;base64,... logo, rendered in the lower-third when present.
  logoSrc?: string;
}

// NOTE: this MUST be a `type` (not `interface`) so it's assignable to
// Record<string, unknown> — Remotion's <Composition> and selectComposition()
// constrain props to that, and only type aliases get the implicit index sig.
export type BuzzVideoProps = {
  scenes: RemotionScene[];
  audioSrc: string; // staticFile-relative, e.g. "media/tts-123.mp3"
  captions: RemotionCaption[];
  showCaptions: boolean;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  branding: RemotionBranding;
};

export const COMPOSITION_ID = "BuzzVideo";

// Used as <Composition defaultProps> and for Remotion Studio previewing.
export const DEFAULT_PROPS: BuzzVideoProps = {
  scenes: [],
  audioSrc: "",
  captions: [],
  showCaptions: false,
  width: 1080,
  height: 1920,
  fps: 25,
  durationInFrames: 25,
  branding: { bgColor: "#0b0b0f", accentColor: "#ffd60a" },
};
