export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { processScheduledPosts } = await import("@/lib/scheduler");
    const { startWorker } = await import("@/lib/worker");

    // Check for due scheduled posts every 60 seconds
    setInterval(async () => {
      try {
        await processScheduledPosts();
      } catch (error) {
        console.error("Scheduler error:", error);
      }
    }, 60_000);

    // Start cron generation
    startWorker();

    console.log("Scheduler + worker started");
  }
}
