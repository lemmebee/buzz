import { AbsoluteFill } from "remotion";

// The single cheapest fix for the "flat template" read: a stack of subtle
// depth layers between the background and the content. Flat fills behind type
// are the loudest "made by a generator" signal; grain + a tinted glow + a
// vignette turn a dead gradient into something that looks lit and printed.
//
// All deterministic and resolution-independent — SVG feTurbulence for grain,
// CSS radial gradients for glow/vignette, blend modes for how they combine.
// Values follow the motion-design research: grain soft-light ~28%, glow screen
// ~22%, vignette multiply ~28%.

// A stable per-instance seed varies the grain so batches don't share one tiled
// noise field. Derived from the id string — no Math.random (unavailable here).
function seedFrom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h;
}

export function DepthStack({
  width,
  height,
  accent,
  seedId = "d",
  glow = true,
  glowX = 0.5,
  glowY = 0.32,
}: {
  width: number;
  height: number;
  accent: string;
  seedId?: string;
  glow?: boolean;
  // Focal point of the glow, as a fraction of the frame.
  glowX?: number;
  glowY?: number;
}) {
  const seed = seedFrom(seedId);
  // A large soft glow reads as ambient light; a small one reads as a spotlight blob.
  const glowRadius = Math.max(width, height) * 0.85;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Accent-tinted glow — warms a flat field and pulls the eye to the focal
          area. Screen blend so it adds light, never darkens. */}
      {glow && (
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            opacity: 0.18,
            background: `radial-gradient(${glowRadius}px ${glowRadius}px at ${glowX * 100}% ${glowY * 100}%, ${accent} 0%, transparent 70%)`,
          }}
        />
      )}
      {/* Film grain via feTurbulence. Overlay (not soft-light) so it actually
          registers on the dark backgrounds these palettes favour — soft-light
          barely affects near-black. baseFrequency ~0.9 = fine grain. */}
      <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: 0.16 }}>
        <svg width={width} height={height} style={{ width: "100%", height: "100%" }}>
          <filter id={`grain-${seed}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
        </svg>
      </AbsoluteFill>
      {/* Vignette — darkens the corners so the center reads as lit. Multiply,
          kept light so it doesn't look like a 2012 Instagram filter. */}
      <AbsoluteFill
        style={{
          mixBlendMode: "multiply",
          opacity: 0.28,
          background: "radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(0,0,0,0.9) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}
