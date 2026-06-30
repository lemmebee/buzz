import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionCaption } from "./types";

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

// Distribute a phrase's [startMs,endMs] across its words so each word can pop in
// turn (the source SRT is phrase-level, not word-level).
function toWords(c: RemotionCaption): Word[] {
  const tokens = c.text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(1, c.endMs - c.startMs);
  const per = span / tokens.length;
  return tokens.map((text, i) => ({
    text,
    startMs: c.startMs + i * per,
    endMs: c.startMs + (i + 1) * per,
  }));
}

// The hero of the typography style: the active narration phrase rendered LARGE
// and centered over the background, with each word popping in as it is spoken.
export function TypographyText({
  captions,
  accentColor,
  videoHeight,
  videoWidth,
}: {
  captions: RemotionCaption[];
  accentColor: string;
  videoHeight: number;
  videoWidth: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const activeIndex = captions.findIndex((c) => nowMs >= c.startMs && nowMs < c.endMs);
  if (activeIndex === -1) return null;
  const active = captions[activeIndex];
  const words = toWords(active);

  // Whole-phrase entrance: fade + slight rise over the first ~8 frames of the cue.
  const cueStartFrame = (active.startMs / 1000) * fps;
  const phraseIn = spring({
    frame: frame - cueStartFrame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.6 },
    durationInFrames: 10,
  });
  const phraseY = interpolate(phraseIn, [0, 1], [28, 0]);

  // Cap the font so even the longest single word fits on one line (long words
  // can't wrap). Approx uppercase Arial Black advance ≈ 0.62em.
  const sidePadFraction = 0.06;
  const innerWidth = videoWidth * (1 - sidePadFraction * 2);
  const longestWordLen = Math.max(1, ...words.map((w) => w.text.length));
  const maxFontForFit = innerWidth / (longestWordLen * 0.62);
  const fontSize = Math.min(Math.round(videoHeight * 0.072), Math.floor(maxFontForFit));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${sidePadFraction * 100}%`,
        transform: `translateY(${phraseY}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: `${Math.round(fontSize * 0.22)}px ${Math.round(fontSize * 0.34)}px`,
          textAlign: "center",
        }}
      >
        {words.map((w, i) => {
          const appeared = nowMs >= w.startMs;
          const isActive = nowMs >= w.startMs && nowMs < w.endMs;
          const popStartFrame = (w.startMs / 1000) * fps;
          const pop = spring({
            frame: frame - popStartFrame,
            fps,
            config: { damping: 13, stiffness: 200, mass: 0.5 },
            durationInFrames: 9,
          });
          const scale = appeared ? interpolate(pop, [0, 1], [0.6, 1]) : 0.6;
          return (
            <span
              key={i}
              style={{
                fontFamily: '"Arial Black", Arial, sans-serif',
                fontWeight: 900,
                fontSize,
                lineHeight: 1.04,
                letterSpacing: "0.3px",
                textTransform: "uppercase",
                color: isActive ? accentColor : "#fff",
                opacity: appeared ? 1 : 0.16,
                transform: `scale(${scale})`,
                textShadow: `0 ${Math.round(fontSize * 0.06)}px ${Math.round(fontSize * 0.18)}px rgba(0,0,0,0.55)`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
