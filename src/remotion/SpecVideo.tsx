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
import { Captions } from "./Captions";
import { fontStack, fontWeight } from "./fonts";
import { fitText } from "./text-fit";
import { TRANSITION_FRAMES, type DecorT, type LayerT, type ResolvedScene, type SpecVideoProps } from "./spec";

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

// ─── Flow-layout bands (ported from the image engine) ────────────────────────
// Text no longer renders as free-floating full-screen AbsoluteFills that can sit
// on top of each other. Every text layer is assigned to one of three fixed slots
// (upper/middle/lower) in a flex column inside the safe area; siblings in a slot
// stack and push each other down, so overlap is structurally impossible — no
// de-confliction referee needed.
type Band = "upper" | "middle" | "lower";
const BAND_ORDER: Band[] = ["upper", "middle", "lower"];
const BAND_OF: Record<LayerT["position"], Band> = {
  top: "upper",
  "upper-third": "upper",
  center: "middle",
  bottom: "lower",
  "lower-third": "lower",
};
const SLOT_ALIGN: Record<Band, "flex-start" | "center" | "flex-end"> = {
  upper: "flex-start",
  middle: "center",
  lower: "flex-end",
};

const isHero = (l: LayerT) => l.sizePct >= 8;
// Display type gets tight negative tracking; small caps/kickers get it positive.
const trackingFor = (l: LayerT) => (isHero(l) ? -0.02 : 0.08);

// Tall formats reserve room for platform chrome; square/landscape get a margin.
function safeInset(width: number, height: number): { x: number; y: number } {
  const tall = height / width > 1.5;
  return { x: width * 0.06, y: tall ? height * 0.13 : height * 0.06 };
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

// A single fitted text layer. fitText measures against the real loaded font and
// shrinks to fit its allotted box (height-aware, unlike the old longest-word
// hack that let hero lines overflow the frame). Words animate in individually to
// keep the kinetic-typography look; the stagger index runs continuously across
// wrapped lines so the cascade reads left-to-right, top-to-bottom.
function TextBlock({
  layer,
  color,
  align,
  boxW,
  boxH,
  canvasH,
}: {
  layer: LayerT;
  color: string;
  align: "left" | "center";
  boxW: number;
  boxH: number;
  canvasH: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const family = fontStack(layer.fontFamily);
  const weight = fontWeight(layer.fontFamily);
  const trackingEm = trackingFor(layer);
  const lineHeight = isHero(layer) ? 1.02 : 1.2;
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;

  const { fontSize, lines } = fitText(
    text,
    boxW,
    boxH,
    {
      maxSize: (layer.sizePct / 100) * canvasH,
      minSize: 14,
      maxLines: isHero(layer) ? 3 : 2,
      lineHeight,
      weight,
      trackingEm,
    },
    family
  );
  if (lines.length === 0) return null;

  let wordIndex = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "center" }}>
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: `0 ${Math.round(fontSize * 0.26)}px`,
            fontFamily: family,
            fontWeight: weight,
            fontSize,
            lineHeight,
            letterSpacing: `${trackingEm * fontSize}px`,
            color,
            textAlign: align,
            textShadow: `0 ${Math.round(fontSize * 0.05)}px ${Math.round(fontSize * 0.16)}px rgba(0,0,0,0.5)`,
            whiteSpace: "nowrap",
          }}
        >
          {line.split(/\s+/).filter(Boolean).map((word) => {
            const style = { display: "inline-block", willChange: "transform, opacity", ...wordEntrance(layer.animation, frame, fps, wordIndex++) };
            return <span key={wordIndex} style={style}>{word}</span>;
          })}
        </div>
      ))}
    </div>
  );
}

// A relational bar (accent-bar above a kicker, or underline beneath a hero).
// Sized from the canvas, never positioned by coordinates.
function Bar({ width, thickness, color }: { width: number; thickness: number; color: string }) {
  return <div style={{ width, height: thickness, backgroundColor: color, borderRadius: thickness / 2 }} />;
}

const decorColor = (d: DecorT, palette: SpecVideoProps["palette"]) => (d.accent ? palette.accent : d.color);

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
  const indexed = scene.layers.map((layer, i) => ({ layer, i }));
  const texts = indexed.filter((x) => x.layer.kind === "text" && x.layer.text.trim().length > 0);
  const align = scene.align ?? "center";

  const inset = safeInset(width, height);
  const safeW = width - inset.x * 2;
  const safeH = height - inset.y * 2;

  const frameDecor = scene.decor?.find((d) => d.role === "frame");
  const accentBar = scene.decor?.find((d) => d.role === "accent-bar");
  const underline = scene.decor?.find((d) => d.role === "underline");
  const barThickness = Math.max(3, Math.round(width * 0.008));
  const slotAlign = align === "left" ? "flex-start" : "center";

  // Assign each text layer to a fixed band slot; empty slots still reserve their
  // third of the column so an occupied band lands where it asked to.
  const byBand = BAND_ORDER.map((band) => ({
    band,
    layers: texts.filter((x) => BAND_OF[x.layer.position] === band),
  }));
  const occupied = byBand.filter((b) => b.layers.length > 0);
  const gap = safeH * 0.04;
  const available = safeH - gap * Math.max(0, occupied.length - 1);
  const weightOf = (ls: typeof texts) => (ls.some((x) => isHero(x.layer)) ? 3 : 1);
  const totalWeight = occupied.reduce((s, b) => s + weightOf(b.layers), 0) || 1;

  return (
    <AbsoluteFill>
      <Background scene={scene} palette={palette} />
      {frameDecor && (
        <div
          style={{
            position: "absolute",
            inset: Math.round(Math.min(width, height) * 0.05),
            border: `${Math.max(2, Math.round(width * 0.005))}px solid ${decorColor(frameDecor, palette)}`,
          }}
        />
      )}
      <AbsoluteFill
        style={{
          paddingLeft: inset.x,
          paddingRight: inset.x,
          paddingTop: inset.y,
          paddingBottom: inset.y,
          display: "flex",
          flexDirection: "column",
          alignItems: slotAlign,
          gap,
        }}
      >
        {byBand.map(({ band, layers: bandLayers }) => {
          if (bandLayers.length === 0) return <div key={band} style={{ flex: 1 }} />;
          const bandH = (available * weightOf(bandLayers)) / totalWeight;
          const sizeSum = bandLayers.reduce((s, x) => s + x.layer.sizePct, 0) || 1;
          const innerGap = safeH * 0.018;
          const contentH = bandH - innerGap * (bandLayers.length - 1);
          const hasHero = bandLayers.some((x) => isHero(x.layer));
          const hasKicker = bandLayers.some((x) => !isHero(x.layer));
          return (
            <div
              key={band}
              style={{
                flex: weightOf(bandLayers),
                display: "flex",
                flexDirection: "column",
                justifyContent: SLOT_ALIGN[band],
                alignItems: slotAlign,
                gap: innerGap,
                width: "100%",
              }}
            >
              {accentBar && hasKicker && (
                <Bar width={width * 0.09} thickness={barThickness} color={decorColor(accentBar, palette)} />
              )}
              {bandLayers.map(({ layer, i }) => (
                <TextBlock
                  key={`t${i}`}
                  layer={layer}
                  color={layer.accent ? palette.accent : layer.color}
                  align={align}
                  boxW={safeW}
                  boxH={(contentH * layer.sizePct) / sizeSum}
                  canvasH={height}
                />
              ))}
              {underline && hasHero && (
                <Bar width={safeW * 0.35} thickness={barThickness} color={decorColor(underline, palette)} />
              )}
            </div>
          );
        })}
      </AbsoluteFill>
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
