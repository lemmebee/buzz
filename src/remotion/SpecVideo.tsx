import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { flip } from "@remotion/transitions/flip";
import { Rect, Circle, Ellipse, Triangle } from "@remotion/shapes";
import { Captions } from "./Captions";
import { fontStack } from "./fonts";
import { TRANSITION_FRAMES, type LayerT, type ResolvedScene, type SpecVideoProps } from "./spec";

// ─── Background ───────────────────────────────────────────────────────────────
function Background({ scene, palette }: { scene: ResolvedScene; palette: SpecVideoProps["palette"] }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (scene.bgKind === "image" && scene.bgImageSrc) {
    // Local assets resolve via staticFile(); a remote URL is passed straight to <Img>.
    const imgSrc = /^https?:\/\//.test(scene.bgImageSrc) ? scene.bgImageSrc : staticFile(scene.bgImageSrc);
    const max = 1.18;
    const scale =
      scene.kenBurns === "in"
        ? interpolate(frame, [0, durationInFrames], [1, max], { extrapolateRight: "clamp" })
        : scene.kenBurns === "out"
        ? interpolate(frame, [0, durationInFrames], [max, 1], { extrapolateRight: "clamp" })
        : 1;
    return (
      <AbsoluteFill style={{ backgroundColor: palette.bg }}>
        <Img
          src={imgSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
        />
        {/* subtle scrim so overlaid text stays legible on any image */}
        <AbsoluteFill
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.55) 100%)" }}
        />
      </AbsoluteFill>
    );
  }
  if (scene.bgKind === "gradient") {
    return (
      <AbsoluteFill
        style={{ background: `linear-gradient(135deg, ${scene.bgColor} 0%, ${scene.bgColor2} 100%)` }}
      />
    );
  }
  return <AbsoluteFill style={{ backgroundColor: scene.bgColor }} />;
}

// ─── Entrance animation presets (closed set) ──────────────────────────────────
function useEntrance(animation: LayerT["animation"]) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 160, mass: 0.6 }, durationInFrames: 12 });
  switch (animation) {
    case "pop":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})` };
    case "slideLeft":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateX(${interpolate(s, [0, 1], [80, 0])}px)` };
    case "fadeUp":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` };
    case "typewriter": // approximated as a quick fade (per-char would need the text)
    case "none":
    default:
      return { opacity: animation === "none" ? 1 : interpolate(s, [0, 1], [0, 1]), transform: "none" };
  }
}

const POSITION_STYLE: Record<LayerT["position"], React.CSSProperties> = {
  center: { alignItems: "center", justifyContent: "center" },
  top: { alignItems: "center", justifyContent: "flex-start", paddingTop: "12%" },
  bottom: { alignItems: "center", justifyContent: "flex-end", paddingBottom: "14%" },
  "upper-third": { alignItems: "center", justifyContent: "flex-start", paddingTop: "22%" },
  "lower-third": { alignItems: "center", justifyContent: "flex-end", paddingBottom: "22%" },
};

// Each text layer renders as its own full-screen positioned AbsoluteFill, so two
// text layers in the same vertical BAND overlap completely (the "glitchy
// doubled text" look). De-conflict bands per scene: keep the layer's position
// when its band is free, else move it to a free band. Preserves good LLM
// layouts and hard-guarantees no overlap even if the model collides positions.
const BAND_OF: Record<LayerT["position"], "upper" | "middle" | "lower"> = {
  top: "upper",
  "upper-third": "upper",
  center: "middle",
  bottom: "lower",
  "lower-third": "lower",
};
const FREE_POSITIONS: LayerT["position"][] = ["center", "upper-third", "lower-third", "top", "bottom"];

function deconflictTextPositions(layers: ResolvedScene["layers"]): Record<number, LayerT["position"]> {
  const used = new Set<string>();
  const resolved: Record<number, LayerT["position"]> = {};
  layers.forEach((l, i) => {
    if (l.kind !== "text") return;
    let pos = l.position;
    if (used.has(BAND_OF[pos])) {
      pos = FREE_POSITIONS.find((p) => !used.has(BAND_OF[p])) ?? pos;
    }
    used.add(BAND_OF[pos]);
    resolved[i] = pos;
  });
  return resolved;
}

// Frames each word's entrance lags behind the previous one — the kinetic
// "words snap in one-by-one" marketing-typography look.
const WORD_STAGGER_FRAMES = 3;

// Pure (NOT a hook): per-word entrance style for the given animation, offset by
// the word's index so words cascade in. spring/interpolate are pure functions.
function wordEntrance(
  animation: LayerT["animation"],
  frame: number,
  fps: number,
  index: number
): React.CSSProperties {
  const s = spring({
    frame: frame - index * WORD_STAGGER_FRAMES,
    fps,
    config: { damping: 16, stiffness: 160, mass: 0.6 },
    durationInFrames: 12,
  });
  switch (animation) {
    case "pop":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `scale(${interpolate(s, [0, 1], [0.5, 1])})` };
    case "slideLeft":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateX(${interpolate(s, [0, 1], [60, 0])}px)` };
    case "typewriter": // sharp per-word reveal
      return { opacity: s < 0.001 ? 0 : 1 };
    case "fadeUp":
      return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` };
    case "none":
    default:
      return { opacity: 1 };
  }
}

function TextLayerView({
  layer,
  palette,
  width,
  height,
}: {
  layer: LayerT;
  palette: SpecVideoProps["palette"];
  width: number;
  height: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Auto-fit: cap the font so the longest word fits the text column on one line
  // (long words can't wrap). Approx uppercase advance ≈ 0.62em.
  const requested = (layer.sizePct / 100) * height;
  const innerWidth = width * 0.86; // matches the 7% horizontal padding each side
  const words = layer.text.split(/\s+/).filter(Boolean);
  const longestWordLen = Math.max(1, ...words.map((w) => w.length));
  const maxForFit = innerWidth / (longestWordLen * 0.62);
  const fontSize = Math.round(Math.min(requested, maxForFit));
  const color = layer.accent ? palette.accent : layer.color;
  return (
    <AbsoluteFill style={{ ...POSITION_STYLE[layer.position], display: "flex", paddingLeft: "7%", paddingRight: "7%" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: `${Math.round(fontSize * 0.06)}px ${Math.round(fontSize * 0.28)}px`,
          textAlign: "center",
          fontFamily: fontStack(layer.fontFamily),
          fontWeight: 800,
          fontSize,
          lineHeight: 1.05,
          color,
          textTransform: layer.uppercase ? "uppercase" : "none",
          textShadow: `0 ${Math.round(fontSize * 0.05)}px ${Math.round(fontSize * 0.16)}px rgba(0,0,0,0.5)`,
          maxWidth: "100%",
        }}
      >
        {words.map((word, i) => (
          <span key={i} style={{ display: "inline-block", willChange: "transform, opacity", ...wordEntrance(layer.animation, frame, fps, i) }}>
            {word}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function ShapeLayerView({ layer, width, height }: { layer: LayerT; width: number; height: number }) {
  const entrance = useEntrance(layer.animation);
  const w = Math.round((layer.widthPct / 100) * width);
  const h = Math.round((layer.heightPct / 100) * height);
  const left = Math.round((layer.xPct / 100) * width);
  const top = Math.round((layer.yPct / 100) * height);

  let shape: React.ReactNode;
  switch (layer.shape) {
    case "circle":
      shape = <Circle radius={Math.min(w, h) / 2} fill={layer.color} />;
      break;
    case "ellipse":
      shape = <Ellipse rx={w / 2} ry={h / 2} fill={layer.color} />;
      break;
    case "triangle":
      shape = <Triangle length={Math.min(w, h)} direction="up" fill={layer.color} />;
      break;
    case "rect":
    default:
      shape = <Rect width={w} height={h} fill={layer.color} cornerRadius={Math.round(Math.min(w, h) * 0.08)} />;
      break;
  }
  return (
    <AbsoluteFill>
      {/* outer div positions (centered on x/y); inner div carries the entrance
          animation so its transform/opacity don't clobber the positioning. */}
      <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)" }}>
        <div style={{ ...entrance, opacity: (typeof entrance.opacity === "number" ? entrance.opacity : 1) * layer.opacity }}>
          {shape}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneView({
  scene,
  palette,
  width,
  height,
}: {
  scene: ResolvedScene;
  palette: SpecVideoProps["palette"];
  width: number;
  height: number;
}) {
  const textPositions = deconflictTextPositions(scene.layers);
  return (
    <AbsoluteFill>
      <Background scene={scene} palette={palette} />
      {scene.layers.map((layer, i) =>
        layer.kind === "shape" ? (
          <ShapeLayerView key={i} layer={layer} width={width} height={height} />
        ) : (
          <TextLayerView
            key={i}
            layer={{ ...layer, position: textPositions[i] ?? layer.position }}
            palette={palette}
            width={width}
            height={height}
          />
        )
      )}
    </AbsoluteFill>
  );
}

type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

function presentationFor(type: ResolvedScene["transition"], width: number, height: number): AnyPresentation {
  switch (type) {
    case "slide": return slide() as unknown as AnyPresentation;
    case "wipe": return wipe() as unknown as AnyPresentation;
    case "clockWipe": return clockWipe({ width, height }) as unknown as AnyPresentation;
    case "flip": return flip() as unknown as AnyPresentation;
    case "fade":
    default: return fade() as unknown as AnyPresentation;
  }
}

// The flexible renderer: interprets ANY validated VideoSpec. Scenes chained via
// TransitionSeries; per-scene transition + Ken Burns + text/shape layers; a
// root voiceover and whisper-synced caption track.
export function SpecVideo({
  scenes,
  audioSrc,
  captions,
  caption,
  palette,
  width,
  height,
}: SpecVideoProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const seq = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={scene.durationInFrames}>
              <SceneView scene={scene} palette={palette} width={width} height={height} />
            </TransitionSeries.Sequence>
          );
          // Insert a transition before every scene except the first (skip "none").
          if (i === 0 || scene.transition === "none") return [seq];
          const timing = scene.transition === "flip" || scene.transition === "slide"
            ? springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_FRAMES })
            : linearTiming({ durationInFrames: TRANSITION_FRAMES });
          return [
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={presentationFor(scene.transition, width, height)}
              timing={timing}
            />,
            seq,
          ];
        })}
      </TransitionSeries>

      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}

      {caption.show && captions.length > 0 ? (
        <Captions captions={captions} accentColor={palette.accent} videoHeight={height} />
      ) : null}
    </AbsoluteFill>
  );
}
