export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { seedSettingsFromEnv } = await import("@/lib/settings");
    await seedSettingsFromEnv();

    const { processScheduledPosts } = await import("@/lib/scheduler");
    const { startWorker } = await import("@/lib/worker");

    setInterval(async () => {
      try {
        await processScheduledPosts();
      } catch (error) {
        console.error("Scheduler error:", error);
      }
    }, 60_000);

    startWorker();

    console.log("Scheduler + worker started");

    // If Remotion is the default video engine, warm its bundle + headless
    // browser in the background so the first render doesn't pay the webpack +
    // Chrome-download cost. Guarded: missing browser/libs must never crash boot.
    void (async () => {
      try {
        const { getVideoProvider } = await import("@/lib/settings");
        if ((await getVideoProvider()) === "remotion") {
          const { warmRemotion } = await import("@/lib/remotion-bundle");
          await warmRemotion();
          console.log("Remotion warmed (bundle + browser ready)");
        }
      } catch (err) {
        console.warn("Remotion warm-up skipped:", err instanceof Error ? err.message : err);
      }
    })();
  }
}
