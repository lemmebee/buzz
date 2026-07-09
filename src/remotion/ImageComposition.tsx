import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontStack, fontWeight } from "./fonts";
import { fitText } from "./text-fit";
import type { LayerT } from "./spec";
import { COMPOSITION, type Composition, type DecorT, type ImageCompositionProps } from "./image-spec";

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
// with a gap; siblings push each other down. Overlap is structurally impossible.
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : "center",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: family,
            fontWeight: weight,
            fontSize,
            lineHeight,
            letterSpacing: `${trackingEm * fontSize}px`,
            color,
            textAlign: align,
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

// ─── Decor ───────────────────────────────────────────────────────────────────
// Relational marks. Each is sized from the canvas and bound to the type it
// serves; none of them carry coordinates.
function Bar({ width, thickness, color }: { width: number; thickness: number; color: string }) {
  return <div style={{ width, height: thickness, backgroundColor: color, borderRadius: thickness / 2 }} />;
}

const decorColor = (d: DecorT, palette: ImageCompositionProps["palette"]) =>
  d.accent ? palette.accent : d.color;

// ─── Plate ───────────────────────────────────────────────────────────────────
function plateStyle(
  plate: Composition["plate"],
  palette: ImageCompositionProps["palette"],
  safeH: number
): React.CSSProperties {
  if (plate === "none") return {};
  if (plate === "block") {
    // Knockout: solid accent field, type reversed out of it.
    return { background: palette.accent, borderRadius: Math.round(safeH * 0.02) };
  }
  return {
    background: "rgba(0,0,0,0.46)",
    backdropFilter: "blur(20px) saturate(0.85)",
    borderRadius: plate === "hug" ? Math.round(safeH * 0.03) : 0,
  };
}

// ─── Main composition ────────────────────────────────────────────────────────
export function ImageComposition({
  bgKind,
  bgImageSrc,
  bgFit,
  bgColor,
  bgColor2,
  archetype,
  align,
  decor,
  layers,
  palette,
  width,
  height,
}: ImageCompositionProps) {
  const inset = safeInset(width, height);
  const safeW = width - inset.x * 2;
  const safeH = height - inset.y * 2;

  const comp = COMPOSITION[archetype] ?? COMPOSITION["centered-axial"];
  // A plate is a legibility device, not decoration. Over imagery, text always
  // gets one (even if the archetype asked for none). Over a flat or gradient
  // ground there is nothing to protect against, so drawing a dark card on a dark
  // gradient just adds a box — the sole exception is the knockout block, which
  // is a deliberate colour field rather than a scrim.
  const plate: Composition["plate"] =
    bgKind === "image"
      ? comp.plate === "none"
        ? "hug"
        : comp.plate
      : comp.plate === "block"
        ? "block"
        : "none";

  const texts = layers.filter((l) => l.kind === "text" && l.text.trim().length > 0);
  // An archetype that names a band collapses the type into it; the flow layout
  // then stacks hero and kicker safely inside that one band.
  const bandFor = (l: LayerT): Band => comp.band ?? BAND_OF[l.position];

  // Every band gets a slot, occupied or not. Distributing only the occupied
  // bands with space-between drops a `middle` band to the bottom of the frame
  // whenever `lower` happens to be empty.
  const byBand = BAND_ORDER.map((band) => ({
    band,
    layers: texts.filter((l) => bandFor(l) === band),
  }));
  const occupied = byBand.filter((b) => b.layers.length > 0);

  const gap = safeH * 0.04;
  const available = safeH - gap * Math.max(0, occupied.length - 1);
  const weightOf = (ls: LayerT[]) => (ls.some(isHero) ? 3 : 1);
  const totalWeight = occupied.reduce((s, b) => s + weightOf(b.layers), 0) || 1;

  // Where a band's content sits inside its own slot.
  const SLOT_ALIGN: Record<Band, "flex-start" | "center" | "flex-end"> = {
    upper: "flex-start",
    middle: "center",
    lower: "flex-end",
  };

  const frame = decor.find((d) => d.role === "frame");
  const accentBar = decor.find((d) => d.role === "accent-bar");
  const underline = decor.find((d) => d.role === "underline");
  const barThickness = Math.max(3, Math.round(width * 0.008));

  // Knocked-out type sits on the accent field, so it takes the background colour.
  const textColorFor = (l: LayerT) =>
    plate === "block" ? palette.bg : l.accent ? palette.accent : l.color;

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
      {frame && (
        // Inset via `inset`, not `margin`: AbsoluteFill already sets width/height
        // to 100%, so a margin pushes the box off the bottom-right of the frame
        // and only two edges of the border ever draw.
        <div
          style={{
            position: "absolute",
            inset: Math.round(Math.min(width, height) * 0.05),
            border: `${Math.max(2, Math.round(width * 0.005))}px solid ${decorColor(frame, palette)}`,
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
          alignItems: align === "left" ? "flex-start" : "center",
          gap,
        }}
      >
        {byBand.map(({ band, layers: bandLayers }) => {
          // Empty bands still take their share of the column, so an occupied
          // band lands in the third of the frame it actually named.
          if (bandLayers.length === 0) {
            return <div key={band} style={{ flex: 1 }} />;
          }
          // One plate per band: a strip reads as a deliberate treatment;
          // stacked boxes read as an accident.
          const platePad = plate === "none" ? 0 : safeW * 0.045;
          const platePadY = plate === "none" ? 0 : safeH * 0.022;
          const isStrip = plate === "strip";
          const innerW = safeW - platePad * 2;
          const bandH = (available * weightOf(bandLayers)) / totalWeight - platePadY * 2;
          const sizeSum = bandLayers.reduce((s, l) => s + l.sizePct, 0) || 1;
          const innerGap = safeH * 0.018;
          const contentH = bandH - innerGap * (bandLayers.length - 1);
          const hasHero = bandLayers.some(isHero);
          const hasKicker = bandLayers.some((l) => !isHero(l));

          return (
            <div
              key={band}
              style={{
                flex: weightOf(bandLayers),
                display: "flex",
                flexDirection: "column",
                justifyContent: SLOT_ALIGN[band],
                alignItems: align === "left" ? "flex-start" : "center",
                width: isStrip ? "100%" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: align === "left" ? "flex-start" : "center",
                  gap: innerGap,
                  padding: `${platePadY}px ${platePad}px`,
                  width: isStrip ? "100%" : undefined,
                  ...plateStyle(plate, palette, safeH),
                }}
              >
                {accentBar && hasKicker && (
                  <Bar width={width * 0.09} thickness={barThickness} color={decorColor(accentBar, palette)} />
                )}
                {bandLayers.map((layer, i) => (
                  <TextBlock
                    key={i}
                    layer={layer}
                    color={textColorFor(layer)}
                    align={align}
                    boxW={innerW}
                    boxH={(contentH * layer.sizePct) / sizeSum}
                    canvasH={height}
                  />
                ))}
                {underline && hasHero && (
                  <Bar width={innerW * 0.35} thickness={barThickness} color={decorColor(underline, palette)} />
                )}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
