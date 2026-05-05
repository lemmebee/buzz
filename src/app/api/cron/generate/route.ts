import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateContent } from "@/lib/generate";
import { sendPostForApproval } from "@/lib/discord";

function isDue(schedule: typeof schema.generationSchedules.$inferSelect): boolean {
  const now = new Date();

  if (!schedule.lastRunAt) return true;

  const nextDue = new Date(schedule.lastRunAt.getTime() + schedule.frequencyHours * 60 * 60 * 1000);
  if (now < nextDue) return false;

  // If missed a cycle (>1.5x frequency), run immediately regardless of time window
  const missedCycle = now.getTime() - schedule.lastRunAt.getTime() > schedule.frequencyHours * 1.5 * 60 * 60 * 1000;
  if (missedCycle) return true;

  // Otherwise only run within 30-minute window of preferred time
  const [prefHour, prefMin] = schedule.preferredTime.split(":").map(Number);
  const prefTotal = prefHour * 60 + prefMin;
  const nowTotal = now.getHours() * 60 + now.getMinutes();
  return Math.abs(nowTotal - prefTotal) <= 30;
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
