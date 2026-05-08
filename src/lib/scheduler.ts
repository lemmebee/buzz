import { lte, eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { publishPost } from "@/lib/instagram";

export async function processScheduledPosts(): Promise<{
  processed: number;
  failed: number;
}> {
  const now = new Date();

  const duePosts = await db
    .select({ id: schema.content.id })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.status, "scheduled"),
        lte(schema.content.scheduledAt, now)
      )
    );

  let processed = 0;
  let failed = 0;

  for (const post of duePosts) {
    const result = await publishPost(post.id);
    if (result.success) {
      processed++;
    } else {
      console.error(`Scheduled post ${post.id} failed:`, result.error);
      failed++;
    }
  }

  if (duePosts.length > 0) {
    console.log(
      `Scheduler: ${processed} published, ${failed} failed out of ${duePosts.length} due`
    );
  }

  return { processed, failed };
}
