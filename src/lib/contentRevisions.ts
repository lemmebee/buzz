import { db, schema } from "@/lib/db";

/**
 * Snapshot the PRIOR scene JSON of a content row before it is overwritten.
 * No-op when there is nothing to preserve.
 */
export async function snapshotContentScene(
  contentId: number,
  priorScene: string | null | undefined,
  source: "manual" | "generation",
): Promise<void> {
  if (!priorScene) return;
  await db.insert(schema.contentRevisions).values({
    contentId,
    field: "scene",
    content: priorScene,
    source,
  });
}
