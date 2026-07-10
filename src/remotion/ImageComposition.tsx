import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontStack, fontWeight } from "./fonts";
import { fitText } from "./text-fit";
import type { LayerT } from "./spec";
import { DepthStack } from "./DepthStack";
import { COMPOSITION, type Composition, type DecorT, type ImageCompositionProps, type ResolvedShowcase } from "./image-spec";

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

// ─── Product showcase ────────────────────────────────────────────────────────
// A real screenshot composed INTO the layout. Sized from its band box, never
// positioned by coordinates — so it flows with the type and cannot collide.
// The device body takes the SCREENSHOT's aspect (clamped to a plausible handset
// range) rather than a fixed 9:19.5 — otherwise objectFit:cover slices the app's
// own UI down the sides, which is the exact defect a showcase exists to avoid.
const PHONE_ASPECT_MIN = 0.42;
const PHONE_ASPECT_MAX = 0.58;
const clampPhoneAspect = (a: number) =>
  Number.isFinite(a) && a > 0 ? Math.min(PHONE_ASPECT_MAX, Math.max(PHONE_ASPECT_MIN, a)) : 0.4615;

export function Showcase({
  showcase,
  boxW,
  boxH,
  bleed = false,
}: {
  showcase: ResolvedShowcase;
  boxW: number;
  boxH: number;
  // A product anchored to the bottom band may run past the safe area and crop at
  // the frame edge — the "device bleeding off frame" look, which reads as art
  // direction rather than a shrunken thumbnail floating in dead space.
  bleed?: boolean;
}) {
  const src = /^https?:\/\//.test(showcase.src) ? showcase.src : staticFile(showcase.src);
  const rotate = `rotate(${showcase.tilt}deg)`;
  // A tilted element sweeps a larger bounding box; shrink so it stays in its box.
  const tiltPad = 1 - Math.min(0.12, Math.abs(showcase.tilt) / 100);
  const bleedFactor = bleed ? 1.42 : 1;

  if (showcase.treatment === "device-frame") {
    const phoneAspect = clampPhoneAspect(showcase.aspect);
    const h = boxH * tiltPad * bleedFactor;
    const w = Math.min(boxW * tiltPad, h * phoneAspect);
    const height = Math.min(h, w / phoneAspect);
    const width = height * phoneAspect;
    const bezel = Math.max(3, width * 0.028);
    return (
      <div
        style={{
          width,
          height,
          transform: rotate,
          borderRadius: width * 0.13,
          background: "linear-gradient(160deg, #2a2a2f 0%, #101013 60%)",
          padding: bezel,
          boxSizing: "border-box",
          boxShadow: `0 ${height * 0.03}px ${height * 0.09}px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)`,
          position: "relative",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: width * 0.105, overflow: "hidden", background: "#000", position: "relative" }}>
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          {/* speaker pill — the cue that reads instantly as "phone" */}
          <div
            style={{
              position: "absolute",
              top: height * 0.014,
              left: "50%",
              transform: "translateX(-50%)",
              width: width * 0.3,
              height: Math.max(3, height * 0.011),
              borderRadius: 999,
              background: "rgba(0,0,0,0.85)",
            }}
          />
        </div>
      </div>
    );
  }

  if (showcase.treatment === "cropped-detail") {
    // A horizontal slice of the UI at full width. Do NOT scale up — zooming past
    // the box crops mid-word (e.g. "6.50 EUR" losing its currency) and reads as a
    // rendering bug rather than a deliberate detail. `cover` on a wide box
    // already crops a tall screenshot vertically, which is the detail we want.
    const width = boxW * 0.92 * tiltPad;
    const height = Math.min(boxH * tiltPad * bleedFactor, width * 0.72);
    return (
      <div
        style={{
          width,
          height,
          transform: rotate,
          borderRadius: Math.min(width, height) * 0.06,
          overflow: "hidden",
          boxShadow: `0 ${height * 0.06}px ${height * 0.16}px rgba(0,0,0,0.5)`,
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
      </div>
    );
  }

  // floating-card
  const width = Math.min(boxW * 0.86, boxH * tiltPad * 1.4);
  const height = Math.min(boxH * tiltPad, width * 1.1);
  return (
    <div
      style={{
        width,
        height,
        transform: rotate,
        borderRadius: Math.min(width, height) * 0.05,
        overflow: "hidden",
        background: "#000",
        boxShadow: `0 ${height * 0.05}px ${height * 0.14}px rgba(0,0,0,0.5)`,
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
    </div>
  );
}

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
  showcase,
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
  // The showcase claims a band of its own; type takes the others. When it lands
  // in a band that already holds type, they stack in flow — never overlap.
  const showcaseBand: Band | null = showcase ? BAND_OF[showcase.position] : null;

  const byBand = BAND_ORDER.map((band) => ({
    band,
    layers: texts.filter((l) => bandFor(l) === band),
    hasShowcase: band === showcaseBand,
  }));
  const occupied = byBand.filter((b) => b.layers.length > 0 || b.hasShowcase);

  const gap = safeH * 0.04;
  const available = safeH - gap * Math.max(0, occupied.length - 1);
  // A product shot is the focal element when present, so it outweighs a hero line.
  const weightOf = (ls: LayerT[], hasShow: boolean) => (hasShow ? 5 : ls.some(isHero) ? 3 : 1);
  const totalWeight = occupied.reduce((s, b) => s + weightOf(b.layers, b.hasShowcase), 0) || 1;

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
      <DepthStack width={width} height={height} accent={palette.accent} seedId={`${archetype}-${layers[0]?.text ?? ""}`} />
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
        {byBand.map(({ band, layers: bandLayers, hasShowcase }) => {
          // Empty bands still take their share of the column, so an occupied
          // band lands in the third of the frame it actually named.
          if (bandLayers.length === 0 && !hasShowcase) {
            return <div key={band} style={{ flex: 1 }} />;
          }
          // A showcase band never gets a plate: the product IS the focal element
          // and must not sit behind a legibility scrim.
          const bandPlate: Composition["plate"] = hasShowcase ? "none" : plate;
          // One plate per band: a strip reads as a deliberate treatment;
          // stacked boxes read as an accident.
          const platePad = bandPlate === "none" ? 0 : safeW * 0.045;
          const platePadY = bandPlate === "none" ? 0 : safeH * 0.022;
          const isStrip = bandPlate === "strip";
          const innerW = safeW - platePad * 2;
          const bandH = (available * weightOf(bandLayers, hasShowcase)) / totalWeight - platePadY * 2;
          // The showcase competes for band height alongside any type beside it.
          const SHOWCASE_WEIGHT = 26;
          const sizeSum = bandLayers.reduce((s, l) => s + l.sizePct, 0) + (hasShowcase ? SHOWCASE_WEIGHT : 0) || 1;
          const itemCount = bandLayers.length + (hasShowcase ? 1 : 0);
          const innerGap = safeH * 0.018;
          const contentH = bandH - innerGap * Math.max(0, itemCount - 1);
          const hasHero = bandLayers.some(isHero);
          const hasKicker = bandLayers.some((l) => !isHero(l));

          return (
            <div
              key={band}
              style={{
                flex: weightOf(bandLayers, hasShowcase),
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
                  ...plateStyle(bandPlate, palette, safeH),
                }}
              >
                {accentBar && hasKicker && !hasShowcase && (
                  <Bar width={width * 0.09} thickness={barThickness} color={decorColor(accentBar, palette)} />
                )}
                {hasShowcase && showcase && (
                  <Showcase
                    showcase={showcase}
                    boxW={innerW}
                    boxH={(contentH * SHOWCASE_WEIGHT) / sizeSum}
                    bleed={band === "lower"}
                  />
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
                {underline && hasHero && !hasShowcase && (
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
