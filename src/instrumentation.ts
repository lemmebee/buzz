export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
