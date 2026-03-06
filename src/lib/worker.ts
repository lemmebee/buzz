import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateContent } from "@/lib/generate";
import { sendPostForApproval, startPolling } from "@/lib/telegram";

function isDue(schedule: typeof schema.generationSchedules.$inferSelect): boolean {
  const now = new Date();

  const [prefHour, prefMin] = schedule.preferredTime.split(":").map(Number);
  const prefTotal = prefHour * 60 + prefMin;
  const nowTotal = now.getHours() * 60 + now.getMinutes();
  if (Math.abs(nowTotal - prefTotal) > 30) return false;

  if (!schedule.lastRunAt) return true;

  const nextDue = new Date(schedule.lastRunAt.getTime() + schedule.frequencyHours * 60 * 60 * 1000);
  return now >= nextDue;
}

async function runScheduledGeneration() {
  const schedules = await db.select()
    .from(schema.generationSchedules)
    .where(eq(schema.generationSchedules.enabled, true));

  for (const schedule of schedules) {
    if (!isDue(schedule)) continue;

    try {
      console.log(`[Cron] Generating for schedule ${schedule.id} (product ${schedule.productId})`);
      const posts = await generateContent({
        productId: schedule.productId,
        platform: schedule.platform as "instagram" | "twitter",
        contentType: schedule.contentType as "reel" | "post" | "story" | "carousel" | "ad",
        count: schedule.count,
      });

      for (const post of posts) {
        const [saved] = await db.insert(schema.posts).values({
          productId: schedule.productId,
          type: schedule.contentType,
          content: post.content,
          hashtags: post.hashtags ? JSON.stringify(post.hashtags) : null,
          mediaUrl: post.mediaUrl || null,
          publicMediaUrl: post.publicMediaUrl || null,
          status: "draft",
          hookUsed: post.metadata.hookUsed,
          pillarUsed: post.metadata.pillarUsed,
          targetType: post.metadata.targetType,
          targetValue: post.metadata.targetValue,
          toneConstraints: post.metadata.toneConstraints ? JSON.stringify(post.metadata.toneConstraints) : null,
          visualDirection: post.metadata.visualDirection,
        }).returning();

        const sent = await sendPostForApproval(saved.id);
        console.log(`[Cron] Draft ${saved.id} created${sent ? " and sent to Telegram" : " but Telegram send FAILED"}`);
      }

      await db.update(schema.generationSchedules)
        .set({ lastRunAt: new Date() })
        .where(eq(schema.generationSchedules.id, schedule.id));
    } catch (err) {
      console.error(`[Cron] Schedule ${schedule.id} failed:`, err);
    }
  }
}

let cronInterval: ReturnType<typeof setInterval> | null = null;

export function startWorker() {
  if (cronInterval) return;

  // Check schedules every 5 minutes
  console.log("[Worker] Starting cron scheduler (every 5 min)");
  runScheduledGeneration().catch(console.error);
  cronInterval = setInterval(() => {
    runScheduledGeneration().catch(console.error);
  }, 5 * 60 * 1000);

  // Start Telegram polling for button presses
  startPolling();
}
