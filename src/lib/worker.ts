import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateContent } from "@/lib/generate";
import { sendPostForApproval } from "@/lib/discord";

function latestAnchor(schedule: typeof schema.generationSchedules.$inferSelect, now: Date): Date {
  const [h, m] = schedule.preferredTime.split(":").map(Number);
  const today = new Date(now);
  today.setHours(h, m, 0, 0);
  const freqMs = schedule.frequencyHours * 60 * 60 * 1000;
  let anchor = today.getTime();
  while (anchor > now.getTime()) anchor -= freqMs;
  while (anchor + freqMs <= now.getTime()) anchor += freqMs;
  return new Date(anchor);
}

function isDue(schedule: typeof schema.generationSchedules.$inferSelect): boolean {
  const now = new Date();
  const anchor = latestAnchor(schedule, now);
  if (now < anchor) return false;
  if (schedule.lastRunAt && schedule.lastRunAt >= anchor) return false;
  return true;
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
        mediaType: schedule.mediaType as "image" | "video",
        targetSurface: schedule.targetSurface as "reel" | "post" | "story" | "ad",
        config: schedule.config ? JSON.parse(schedule.config) : undefined,
        count: schedule.count,
      });

      for (const post of posts) {
        const [saved] = await db.insert(schema.content).values({
          productId: schedule.productId,
          mediaType: schedule.mediaType,
          targetSurface: schedule.targetSurface,
          content: post.content,
          hashtags: post.hashtags ? JSON.stringify(post.hashtags) : null,
          mediaUrl: post.mediaUrl || null,
          publicMediaUrl: post.publicMediaUrl || null,
          script: post.script || null,
          duration: post.duration ?? null,
          audioUrl: post.audioUrl || null,
          captionsUrl: post.captionsUrl || null,
          config: post.config ? JSON.stringify(post.config) : null,
          status: "draft",
          hookUsed: post.metadata.hookUsed,
          pillarUsed: post.metadata.pillarUsed,
          targetType: post.metadata.targetType,
          targetValue: post.metadata.targetValue,
          toneConstraints: post.metadata.toneConstraints ? JSON.stringify(post.metadata.toneConstraints) : null,
          visualDirection: post.metadata.visualDirection,
        }).returning();

        const sent = await sendPostForApproval(saved.id);
        console.log(`[Cron] Draft ${saved.id} created${sent ? " and sent to Discord" : " but Discord send FAILED"}`);
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
}
