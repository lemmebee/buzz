import path from "path";
import { existsSync, lstatSync, rmSync, symlinkSync } from "fs";
import { bundle } from "@remotion/bundler";
import { ensureBrowser } from "@remotion/renderer";

// The Remotion bundle is built ONCE per process (webpack is expensive) and the
// returned serveUrl dir is reused across every render. ensureBrowser() makes
// sure Chrome Headless Shell is present so the first render doesn't stall on a
// download. Both are warmed at startup from instrumentation.ts.

// Remotion COPIES publicDir into the bundle output as a one-time SNAPSHOT. Since
// the bundle is memoized at warm-up (server start), per-render assets (stills,
// voiceover, captions written into public/ afterward) are missing from that
// snapshot → staticFile("media/...") 404s mid-render and the video falls back.
// Replace the snapshot with a symlink to the LIVE public dir so freshly
// generated assets resolve immediately (also avoids copying ~50MB of media).
function linkLivePublicDir(serveUrl: string): string {
  const livePublic = path.join(process.cwd(), "public");
  const bundlePublic = path.join(serveUrl, "public");
  try {
    if (existsSync(bundlePublic) && !lstatSync(bundlePublic).isSymbolicLink()) {
      rmSync(bundlePublic, { recursive: true, force: true });
    }
    if (!existsSync(bundlePublic)) {
      symlinkSync(livePublic, bundlePublic, "dir");
    }
  } catch (err) {
    console.warn(
      "[remotion] could not symlink live public dir, per-render assets may 404:",
      err instanceof Error ? err.message : err
    );
  }
  return serveUrl;
}

let bundlePromise: Promise<string> | null = null;
let browserPromise: Promise<void> | null = null;

export function getRemotionBundle(): Promise<string> {
  if (!bundlePromise) {
    const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");
    bundlePromise = bundle({
      entryPoint,
      // Point Remotion's public dir at the app's existing public/ folder. NOTE:
      // bundle() COPIES this into the output; linkLivePublicDir() below swaps the
      // copy for a live symlink so per-render assets resolve (see its comment).
      publicDir: path.join(process.cwd(), "public"),
      // Disable webpack's persistent filesystem cache for this one-time bundle.
      // It runs once per process and a stale/corrupt pack cache produces noisy
      // "PackFileCacheStrategy ... Expected end of object" warnings in the
      // server log. In-memory compile is clean and still fast for one bundle.
      webpackOverride: (config) => ({ ...config, cache: false }),
    })
      .then(linkLivePublicDir)
      .catch((err) => {
        bundlePromise = null; // let a later call retry
        throw err;
      });
  }
  return bundlePromise;
}

export function ensureRemotionBrowser(): Promise<void> {
  if (!browserPromise) {
    browserPromise = ensureBrowser()
      .then(() => undefined)
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function warmRemotion(): Promise<void> {
  await Promise.all([getRemotionBundle(), ensureRemotionBrowser()]);
}
