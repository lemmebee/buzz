export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PointerDelta {
  dx: number;
  dy: number;
}

const MIN = 8;

/** Translate a box by a screen-space pointer delta, converted to scene coords. */
export function applyDrag(start: Box, d: PointerDelta, scale: number): Box {
  return {
    ...start,
    x: Math.round(start.x + d.dx / scale),
    y: Math.round(start.y + d.dy / scale),
  };
}

/** Resize a box from its top-left anchor by a screen-space pointer delta. */
export function applyResize(start: Box, d: PointerDelta, scale: number): Box {
  return {
    ...start,
    w: Math.max(MIN, Math.round(start.w + d.dx / scale)),
    h: Math.max(MIN, Math.round(start.h + d.dy / scale)),
  };
}
