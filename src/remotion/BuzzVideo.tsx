import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SceneClip } from "./SceneClip";
import { Captions } from "./Captions";
import { LowerThird } from "./LowerThird";
import type { BuzzVideoProps } from "./types";

export function BuzzVideo({
  scenes,
  audioSrc,
  captions,
  showCaptions,
  branding,
  height,
  fps,
}: BuzzVideoProps) {
  // Cross-dissolve: each scene (except the last) extends `overlap` frames into
  // the next, and the next scene fades in over those frames while sitting on
  // top. Total duration stays sum(scene durations), so audio stays in sync.
  const overlap =
    scenes.length > 1
      ? Math.min(
          Math.round(fps * 0.4),
          Math.floor(Math.min(...scenes.map((s) => s.durationInFrames)) / 2)
        )
      : 0;

  let cursor = 0;
  const placed = scenes.map((s, i) => {
    const from = cursor;
    cursor += s.durationInFrames;
    return { ...s, from, index: i };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: branding.bgColor }}>
      {placed.map((s, i) => {
        const isLast = i === placed.length - 1;
        const extend = isLast ? 0 : overlap;
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames + extend}>
            <SceneClip
              src={s.src}
              durationInFrames={s.durationInFrames + extend}
              fadeFrames={i === 0 ? 0 : overlap}
              zoomDir={i % 2 === 0 ? "in" : "out"}
              index={i}
            />
          </Sequence>
        );
      })}

      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}

      {showCaptions && captions.length > 0 ? (
        <Captions captions={captions} accentColor={branding.accentColor} videoHeight={height} />
      ) : null}

      <LowerThird
        handle={branding.handle}
        logoSrc={branding.logoSrc}
        accentColor={branding.accentColor}
        videoHeight={height}
      />
    </AbsoluteFill>
  );
}
