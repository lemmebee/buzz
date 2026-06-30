// Per-process health of image providers. The fallback image provider marks a
// provider "down" when it returns a terminal error (out of credits / bad key)
// and "up" on success. The video orchestrator reads this BEFORE authoring so it
// can tell the creative director "no images this run — design text-only" instead
// of designing an image video and silently degrading every scene to a flat color.
// In-memory only (resets on restart) with a TTL so a topped-up provider recovers.

const DOWN_TTL_MS = 10 * 60 * 1000; // re-probe a "down" provider after 10 min
const downUntil = new Map<string, number>();

export function markImageProviderDown(name: string): void {
  downUntil.set(name, Date.now() + DOWN_TTL_MS);
}

export function markImageProviderUp(name: string): void {
  downUntil.delete(name);
}

export function isImageProviderDown(name: string): boolean {
  const until = downUntil.get(name);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    downUntil.delete(name); // TTL expired — allow a re-probe
    return false;
  }
  return true;
}

// Images are available if at least one resolvable provider isn't currently down.
// An empty list (nothing configured) means no image generation is possible.
export function imagesAvailable(providerNames: string[]): boolean {
  if (providerNames.length === 0) return false;
  return providerNames.some((n) => !isImageProviderDown(n));
}
