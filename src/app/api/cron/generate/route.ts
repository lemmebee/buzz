import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await db.select()
    .from(schema.generationSchedules)
    .where(eq(schema.generationSchedules.enabled, true));

  let generated = 0;
  let errors = 0;

  for (const schedule of schedules) {
    if (!isDue(schedule)) continue;

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
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

          await sendPostForApproval(saved.id);
          generated++;
        }

        await db.update(schema.generationSchedules)
          .set({ lastRunAt: new Date() })
          .where(eq(schema.generationSchedules.id, schedule.id));

        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /503|429|quota|rate.?limit|high demand|temporarily/i.test(msg);
        console.error(`Schedule ${schedule.id} attempt ${attempt}/${MAX_RETRIES} failed:`, msg);

        if (!isTransient || attempt === MAX_RETRIES) {
          errors++;
          break;
        }
        // Exponential backoff: 5s, 15s
        await new Promise(r => setTimeout(r, 5000 * Math.pow(3, attempt - 1)));
      }
    }
  }

  return NextResponse.json({ generated, errors, schedulesChecked: schedules.length });
}
