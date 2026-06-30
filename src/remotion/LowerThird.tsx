import { Img, interpolate, useCurrentFrame } from "remotion";

// A subtle branded chip pinned top-left: optional logo + @handle, with a brand
// accent bar. Fades in over the first ~0.5s. Renders nothing if there's no
// handle or logo to show.
export function LowerThird({
  handle,
  logoSrc,
  accentColor,
  videoHeight,
}: {
  handle?: string;
  logoSrc?: string;
  accentColor: string;
  videoHeight: number;
}) {
  const frame = useCurrentFrame();
  if (!handle && !logoSrc) return null;

  const opacity = interpolate(frame, [3, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pad = Math.round(videoHeight * 0.012);
  const logoSize = Math.round(videoHeight * 0.05);
  const fontSize = Math.round(videoHeight * 0.024);

  return (
    <div
      style={{
        position: "absolute",
        top: "4%",
        left: "5%",
        display: "flex",
        alignItems: "center",
        gap: `${pad}px`,
        padding: `${pad}px ${pad * 1.6}px`,
        borderRadius: 9999,
        background: "rgba(0,0,0,0.45)",
        borderLeft: `${Math.max(3, Math.round(videoHeight * 0.004))}px solid ${accentColor}`,
        backdropFilter: "blur(4px)",
        opacity,
      }}
    >
      {logoSrc ? (
        <Img
          src={logoSrc}
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 9999,
            objectFit: "cover",
          }}
        />
      ) : null}
      {handle ? (
        <span
          style={{
            fontFamily: "Arial, sans-serif",
            fontWeight: 700,
            fontSize,
            color: "#fff",
            letterSpacing: "0.3px",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
