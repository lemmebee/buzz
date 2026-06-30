import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionCaption } from "./types";

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

// Split a phrase cue into word tokens with evenly-distributed timing. The source
// SRT is phrase-level (whisper-tiny), so per-word timing is approximated by
// spreading the cue's [startMs,endMs] across its words — enough for a
// word-by-word "pop" reveal without a second transcription pass.
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

export function Captions({
  captions,
  accentColor,
  videoHeight,
}: {
  captions: RemotionCaption[];
  accentColor: string;
  videoHeight: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const active = captions.find((c) => nowMs >= c.startMs && nowMs < c.endMs);
  if (!active) return null;

  const words = toWords(active);
  const fontSize = Math.round(videoHeight * 0.046);
  // Bold white text with a heavy black outline + shadow, matching the ffmpeg
  // burned-subtitle look (Arial Black, white fill, black outline/shadow).
  const outline = "#000";
  const textShadow = `0 0 ${Math.round(fontSize * 0.12)}px ${outline}, 2px 2px 0 ${outline}, -2px -2px 0 ${outline}, 2px -2px 0 ${outline}, -2px 2px 0 ${outline}`;

  return (
    <div
      style={{
        position: "absolute",
        left: "6%",
        right: "6%",
        bottom: "20%",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: `${Math.round(fontSize * 0.28)}px`,
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
          config: { damping: 14, stiffness: 200, mass: 0.5 },
          durationInFrames: 8,
        });
        const scale = appeared ? interpolate(pop, [0, 1], [0.7, 1]) : 0.7;
        return (
          <span
            key={i}
            style={{
              fontFamily: '"Arial Black", Arial, sans-serif',
              fontWeight: 900,
              fontSize,
              lineHeight: 1.05,
              color: isActive ? accentColor : "#fff",
              opacity: appeared ? 1 : 0.18,
              transform: `scale(${scale})`,
              textShadow,
              WebkitTextStroke: `${Math.max(1, Math.round(fontSize * 0.03))}px ${outline}`,
              letterSpacing: "0.5px",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}
