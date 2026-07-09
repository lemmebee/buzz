// Deterministic text fitting: measure → wrap → shrink.
//
// Runs inside Remotion's headless Chrome, so we measure with canvas TextMetrics
// against the real loaded font rather than guessing from character counts.
// The previous approach sized type by dividing the box width by the longest
// word's length, which has no height term at all — a 6-word headline would
// wrap to 4 lines and silently overflow the frame.

export interface FitOptions {
  maxSize: number;
  minSize?: number;
  maxLines?: number;
  lineHeight?: number;
  weight?: number;
  trackingEm?: number;
}

export interface FitResult {
  fontSize: number;
  lines: string[];
  blockHeight: number;
}

let ctx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  return ctx as CanvasRenderingContext2D;
}

function measure(text: string, size: number, family: string, weight: number, trackingEm: number): number {
  const c = measurer();
  c.font = `${weight} ${size}px ${family}`;
  // Chrome supports canvas letterSpacing; it must match the rendered CSS.
  c.letterSpacing = `${trackingEm * size}px`;
  return c.measureText(text).width;
}

// First-fit line breaker. Words longer than the box get their own line and are
// handled by the shrink loop rather than being split mid-word.
function greedyWrap(
  words: string[],
  boxW: number,
  size: number,
  family: string,
  weight: number,
  trackingEm: number
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, size, family, weight, trackingEm) > boxW) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Binary-search the largest size whose wrapped block fits the box.
//
// Width-vs-size is only approximately monotonic (kerning and line-break
// positions shift as size changes), so this is an approximation with a small
// safety margin, which is what production text fitters do.
export function fitText(text: string, boxW: number, boxH: number, opts: FitOptions, family: string): FitResult {
  const {
    maxSize,
    minSize = 8,
    maxLines = 4,
    lineHeight = 1.05,
    weight = 800,
    trackingEm = 0,
  } = opts;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { fontSize: minSize, lines: [], blockHeight: 0 };

  const fits = (size: number): string[] | null => {
    const lines = greedyWrap(words, boxW, size, family, weight, trackingEm);
    if (lines.length > maxLines) return null;
    if (lines.length * size * lineHeight > boxH) return null;
    if (lines.some((l) => measure(l, size, family, weight, trackingEm) > boxW)) return null;
    return lines;
  };

  let lo = minSize;
  let hi = maxSize;
  let best = fits(minSize);

  // If even the floor doesn't fit, use it anyway — clipping beats a blank frame.
  if (!best) {
    const lines = greedyWrap(words, boxW, minSize, family, weight, trackingEm);
    return { fontSize: minSize, lines, blockHeight: lines.length * minSize * lineHeight };
  }

  let bestSize = minSize;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    const lines = fits(mid);
    if (lines) {
      best = lines;
      bestSize = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const fontSize = Math.floor(bestSize * 0.98); // safety margin
  const wrapped = greedyWrap(words, boxW, fontSize, family, weight, trackingEm);
  const lines = balance(wrapped, words, boxW, fontSize, family, weight, trackingEm);
  return { fontSize, lines, blockHeight: lines.length * fontSize * lineHeight };
}

// Equalize line lengths without changing the line count — the same idea as CSS
// `text-wrap: balance`. Greedy wrapping packs early lines full and leaves the
// last one short ("logged before you / leave the / counter"), which reads as
// jagged. Narrowing the wrap width until the line count is about to grow yields
// the most even break for the same number of lines.
function balance(
  lines: string[],
  words: string[],
  boxW: number,
  size: number,
  family: string,
  weight: number,
  trackingEm: number
): string[] {
  if (lines.length < 2) return lines;

  const target = lines.length;
  let lo = 0;
  let hi = boxW;
  let best = lines;

  // Smallest width that still wraps to `target` lines.
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    const candidate = greedyWrap(words, mid, size, family, weight, trackingEm);
    if (candidate.length <= target) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  // Never return something that overflows the real box.
  return best.every((l) => measure(l, size, family, weight, trackingEm) <= boxW) ? best : lines;
}
