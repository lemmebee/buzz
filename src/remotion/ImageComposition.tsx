import { AbsoluteFill, Img, staticFile } from "remotion";
import { Rect, Circle, Ellipse, Triangle } from "@remotion/shapes";
import { fontStack, fontWeight } from "./fonts";
import { fitText } from "./text-fit";
import type { LayerT } from "./spec";
import type { ImageCompositionProps } from "./image-spec";

// ─── Background ──────────────────────────────────────────────────────────────
// Photos fill the frame. Product screenshots must NOT: they are 9:16 and get
// cropped to a meaningless middle slice by objectFit:cover, so they are letter-
// boxed over a blurred copy of themselves.
function StaticBackground({
  bgKind,
  bgImageSrc,
  bgFit,
  bgColor,
  bgColor2,
  palette,
}: {
  bgKind: ImageCompositionProps["bgKind"];
  bgImageSrc?: string;
  bgFit: ImageCompositionProps["bgFit"];
  bgColor: string;
  bgColor2: string;
  palette: ImageCompositionProps["palette"];
}) {
  if (bgKind === "image" && bgImageSrc) {
    const imgSrc = /^https?:\/\//.test(bgImageSrc) ? bgImageSrc : staticFile(bgImageSrc);
    return (
      <AbsoluteFill style={{ backgroundColor: palette.bg }}>
        {/* Each image needs its own AbsoluteFill: siblings inside one would
            stack in normal flow and push the second one out of frame. */}
        {bgFit === "contain" && (
          <AbsoluteFill>
            <Img
              src={imgSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(48px) saturate(0.7) brightness(0.35)",
                transform: "scale(1.15)",
              }}
            />
          </AbsoluteFill>
        )}
        <AbsoluteFill>
          <Img src={imgSrc} style={{ width: "100%", height: "100%", objectFit: bgFit }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.22)" }} />
      </AbsoluteFill>
    );
  }
  if (bgKind === "gradient") {
    return (
      <AbsoluteFill
        style={{ background: `linear-gradient(135deg, ${bgColor} 0%, ${bgColor2} 100%)` }}
      />
    );
  }
  return <AbsoluteFill style={{ backgroundColor: bgColor }} />;
}

// ─── Safe area ───────────────────────────────────────────────────────────────
// Tall formats reserve room for platform chrome (Stories/Reels UI eats roughly
// the top and bottom 13%). Square/landscape just get a quiet margin.
function safeInset(width: number, height: number): { x: number; y: number } {
  const tall = height / width > 1.5;
  return { x: width * 0.06, y: tall ? height * 0.13 : height * 0.06 };
}

// ─── Bands ───────────────────────────────────────────────────────────────────
// Three flow rows in a column. Layers assigned to the same band stack inside it
// with a gap; siblings push each other down. Overlap is structurally impossible,
// so no de-confliction pass is needed.
type Band = "upper" | "middle" | "lower";
const BAND_ORDER: Band[] = ["upper", "middle", "lower"];
const BAND_OF: Record<LayerT["position"], Band> = {
  top: "upper",
  "upper-third": "upper",
  center: "middle",
  bottom: "lower",
  "lower-third": "lower",
};

const isHero = (l: LayerT) => l.sizePct >= 8;

// Display type gets tight negative tracking; small caps/kickers get it positive.
const trackingFor = (l: LayerT) => (isHero(l) ? -0.02 : 0.08);

function TextBlock({
  layer,
  palette,
  boxW,
  boxH,
  canvasH,
}: {
  layer: LayerT;
  palette: ImageCompositionProps["palette"];
  boxW: number;
  boxH: number;
  canvasH: number;
}) {
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
      // sizePct is the LLM's *request*; the fit only ever shrinks from here.
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

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: family,
            fontWeight: weight,
            fontSize,
            lineHeight,
            letterSpacing: `${trackingEm * fontSize}px`,
            color: layer.accent ? palette.accent : layer.color,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

// ─── Shapes ──────────────────────────────────────────────────────────────────
function StaticShapeLayer({ layer, width, height }: { layer: LayerT; width: number; height: number }) {
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
      <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", opacity: layer.opacity }}>
        {shape}
      </div>
    </AbsoluteFill>
  );
}

// ─── Main composition ────────────────────────────────────────────────────────
export function ImageComposition({
  bgKind,
  bgImageSrc,
  bgFit,
  bgColor,
  bgColor2,
  layers,
  palette,
  width,
  height,
}: ImageCompositionProps) {
  const inset = safeInset(width, height);
  const safeW = width - inset.x * 2;
  const safeH = height - inset.y * 2;

  const shapes = layers.filter((l) => l.kind === "shape");
  const texts = layers.filter((l) => l.kind === "text" && l.text.trim().length > 0);

  const byBand = BAND_ORDER.map((band) => ({
    band,
    layers: texts.filter((l) => BAND_OF[l.position] === band),
  })).filter((b) => b.layers.length > 0);

  // Allocate vertical space: the hero band takes the lion's share.
  const gap = safeH * 0.04;
  const available = safeH - gap * Math.max(0, byBand.length - 1);
  const weightOf = (ls: LayerT[]) => (ls.some(isHero) ? 3 : 1);
  const totalWeight = byBand.reduce((s, b) => s + weightOf(b.layers), 0) || 1;

  // Text over a photo or screenshot needs a guaranteed contrast floor.
  const plated = bgKind === "image";

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      <StaticBackground
        bgKind={bgKind}
        bgImageSrc={bgImageSrc}
        bgFit={bgFit}
        bgColor={bgColor}
        bgColor2={bgColor2}
        palette={palette}
      />
      {shapes.map((layer, i) => (
        <StaticShapeLayer key={`s${i}`} layer={layer} width={width} height={height} />
      ))}
      <AbsoluteFill
        style={{
          paddingLeft: inset.x,
          paddingRight: inset.x,
          paddingTop: inset.y,
          paddingBottom: inset.y,
          display: "flex",
          flexDirection: "column",
          // With a single occupied band, honour which band it is rather than
          // centring it over the subject.
          justifyContent:
            byBand.length > 1
              ? "space-between"
              : byBand[0]?.band === "upper"
                ? "flex-start"
                : byBand[0]?.band === "lower"
                  ? "flex-end"
                  : "center",
          alignItems: "center",
          gap,
        }}
      >
        {byBand.map(({ band, layers: bandLayers }) => {
          // One plate per band, not per layer — a strip reads as a deliberate
          // treatment; stacked boxes read as an accident.
          const padX = plated ? safeW * 0.045 : 0;
          const padY = plated ? safeH * 0.022 : 0;
          const innerW = safeW - padX * 2;
          const bandH = (available * weightOf(bandLayers)) / totalWeight - padY * 2;
          const sizeSum = bandLayers.reduce((s, l) => s + l.sizePct, 0) || 1;
          const innerGap = safeH * 0.018;
          const contentH = bandH - innerGap * (bandLayers.length - 1);
          return (
            <div
              key={band}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: innerGap,
                padding: `${padY}px ${padX}px`,
                borderRadius: plated ? Math.round(safeH * 0.03) : 0,
                background: plated ? "rgba(0,0,0,0.46)" : "none",
                backdropFilter: plated ? "blur(20px) saturate(0.85)" : "none",
              }}
            >
              {bandLayers.map((layer, i) => (
                <TextBlock
                  key={i}
                  layer={layer}
                  palette={palette}
                  boxW={innerW}
                  boxH={(contentH * layer.sizePct) / sizeSum}
                  canvasH={height}
                />
              ))}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
