import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { snapshotContentScene } from "@/lib/contentRevisions";

async function makeContent(scene: unknown | null): Promise<number> {
  const [row] = await db
    .insert(schema.content)
    .values({
      mediaType: "image",
      targetSurface: "post",
      content: "x",
      status: "draft",
      scene,
    })
    .returning();
  return row.id;
}

describe("snapshotContentScene", () => {
  let cid: number;
  beforeEach(async () => {
    cid = await makeContent({ w: 1080, h: 1350, old: true });
  });

  it("inserts a revision row holding the prior scene JSON", async () => {
    await snapshotContentScene(cid, JSON.stringify({ w: 1080, h: 1350, old: true }), "manual");
    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, cid));
    expect(revs.length).toBe(1);
    expect(revs[0].field).toBe("scene");
    expect(revs[0].source).toBe("manual");
    expect(JSON.parse(revs[0].content)).toMatchObject({ old: true });
  });

  it("is a no-op when prior scene is null/empty", async () => {
    const empty = await makeContent(null);
    await snapshotContentScene(empty, null, "manual");
    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, empty));
    expect(revs.length).toBe(0);
  });
});
