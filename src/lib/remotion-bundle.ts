import path from "path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser } from "@remotion/renderer";

// The Remotion bundle is built ONCE per process (webpack is expensive) and the
// returned serveUrl dir is reused across every render. ensureBrowser() makes
// sure Chrome Headless Shell is present so the first render doesn't stall on a
// download. Both are warmed at startup from instrumentation.ts.

let bundlePromise: Promise<string> | null = null;
let browserPromise: Promise<void> | null = null;

export function getRemotionBundle(): Promise<string> {
  if (!bundlePromise) {
    const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");
    bundlePromise = bundle({
      entryPoint,
      // Point Remotion's public dir at the app's existing public/ folder so
      // staticFile("media/...") resolves the already-generated stills/audio
      // with no copying or symlinks.
      publicDir: path.join(process.cwd(), "public"),
      // Disable webpack's persistent filesystem cache for this one-time bundle.
      // It runs once per process and a stale/corrupt pack cache produces noisy
      // "PackFileCacheStrategy ... Expected end of object" warnings in the
      // server log. In-memory compile is clean and still fast for one bundle.
      webpackOverride: (config) => ({ ...config, cache: false }),
    }).catch((err) => {
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
