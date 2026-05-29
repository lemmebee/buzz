export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Register the scene renderer used by the image generation pipeline
    // (generate.ts -> getSceneRenderer()). Must run before any generation.
    const { registerSceneRenderer, createSatoriResvgRenderer } = await import("@/lib/providers");
    registerSceneRenderer(createSatoriResvgRenderer());

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
  }
}
