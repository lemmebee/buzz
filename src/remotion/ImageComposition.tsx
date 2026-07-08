import { AbsoluteFill, Img, staticFile } from "remotion";
import { Rect, Circle, Ellipse, Triangle } from "@remotion/shapes";
import { fontStack } from "./fonts";
import type { LayerT } from "./spec";
import type { ImageCompositionProps } from "./image-spec";

// ─── Static background (no Ken Burns) ────────────────────────────────────────
function StaticBackground({
  bgKind,
  bgImageSrc,
  bgColor,
  bgColor2,
  palette,
}: {
  bgKind: ImageCompositionProps["bgKind"];
  bgImageSrc?: string;
  bgColor: string;
  bgColor2: string;
  palette: ImageCompositionProps["palette"];
}) {
  if (bgKind === "image" && bgImageSrc) {
    const imgSrc = /^https?:\/\//.test(bgImageSrc) ? bgImageSrc : staticFile(bgImageSrc);
    return (
      <AbsoluteFill style={{ backgroundColor: palette.bg }}>
        <Img
          src={imgSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <AbsoluteFill
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.55) 100%)" }}
        />
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

// ─── Position layout (reused from SpecVideo) ─────────────────────────────────
const POSITION_STYLE: Record<LayerT["position"], React.CSSProperties> = {
  center: { alignItems: "center", justifyContent: "center" },
  top: { alignItems: "center", justifyContent: "flex-start", paddingTop: "12%" },
  bottom: { alignItems: "center", justifyContent: "flex-end", paddingBottom: "14%" },
  "upper-third": { alignItems: "center", justifyContent: "flex-start", paddingTop: "22%" },
  "lower-third": { alignItems: "center", justifyContent: "flex-end", paddingBottom: "22%" },
};

// ─── Text position de-confliction (reused from SpecVideo) ────────────────────
const BAND_OF: Record<LayerT["position"], "upper" | "middle" | "lower"> = {
  top: "upper",
  "upper-third": "upper",
  center: "middle",
  bottom: "lower",
  "lower-third": "lower",
};
const FREE_POSITIONS: LayerT["position"][] = ["center", "upper-third", "lower-third", "top", "bottom"];

function deconflictTextPositions(layers: LayerT[]): Record<number, LayerT["position"]> {
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

// ─── Static text layer (no animations, everything at rest) ───────────────────
function StaticTextLayer({
  layer,
  palette,
  width,
  height,
}: {
  layer: LayerT;
  palette: ImageCompositionProps["palette"];
  width: number;
  height: number;
}) {
  const requested = (layer.sizePct / 100) * height;
  const innerWidth = width * 0.86;
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
          <span key={i} style={{ display: "inline-block" }}>{word}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ─── Static shape layer (no animations) ──────────────────────────────────────
function StaticShapeLayer({
  layer,
  width,
  height,
}: {
  layer: LayerT;
  width: number;
  height: number;
}) {
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
  bgColor,
  bgColor2,
  layers,
  palette,
  width,
  height,
}: ImageCompositionProps) {
  const textPositions = deconflictTextPositions(layers);
  const indexed = layers.map((layer, i) => ({ layer, i }));
  const shapes = indexed.filter((x) => x.layer.kind === "shape");
  const texts = indexed.filter((x) => x.layer.kind === "text");

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      <StaticBackground
        bgKind={bgKind}
        bgImageSrc={bgImageSrc}
        bgColor={bgColor}
        bgColor2={bgColor2}
        palette={palette}
      />
      {shapes.map(({ layer, i }) => (
        <StaticShapeLayer key={`s${i}`} layer={layer} width={width} height={height} />
      ))}
      {texts.map(({ layer, i }) => (
        <StaticTextLayer
          key={`t${i}`}
          layer={{ ...layer, position: textPositions[i] ?? layer.position }}
          palette={palette}
          width={width}
          height={height}
        />
      ))}
    </AbsoluteFill>
  );
}
