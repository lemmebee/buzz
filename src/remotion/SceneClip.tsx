import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

// Reproduces the ffmpeg baseline (compose.ts): cover-fit the still (image
// providers don't guarantee dimensions) plus a Ken Burns zoom matching
// z=min(zoom+0.0008,1.2). Adds a fade-in over `fadeFrames` so adjacent scenes
// cross-dissolve when this clip is layered on top of the previous one.
const ORIGINS = ["center center", "top left", "bottom right", "top right", "bottom left"];

export function SceneClip({
  src,
  durationInFrames,
  fadeFrames,
  zoomDir,
  index,
}: {
  src: string;
  durationInFrames: number;
  fadeFrames: number;
  zoomDir: "in" | "out";
  index: number;
}) {
  const frame = useCurrentFrame();

  const opacity =
    fadeFrames > 0
      ? interpolate(frame, [0, fadeFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const maxZoom = Math.min(1 + 0.0008 * durationInFrames, 1.2);
  const scale =
    zoomDir === "in"
      ? interpolate(frame, [0, durationInFrames], [1, maxZoom], { extrapolateRight: "clamp" })
      : interpolate(frame, [0, durationInFrames], [maxZoom, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: ORIGINS[index % ORIGINS.length],
        }}
      />
    </AbsoluteFill>
  );
}
