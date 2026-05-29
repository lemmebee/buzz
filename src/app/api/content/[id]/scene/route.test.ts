import { describe, it, expect, beforeAll, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// Stub the server renderer (source of truth) so the route test is hermetic.
vi.mock("@/lib/providers", async (orig) => {
  const actual = await orig<typeof import("@/lib/providers")>();
  return {
    ...actual,
    createSceneRenderer: () => ({
      name: "stub",
      async generate() {
        return { url: "/api/media/scene-stub.png", localPath: "/api/media/scene-stub.png" };
      },
    }),
  };
});

import { POST } from "@/app/api/content/[id]/scene/route";

const sampleScene = {
  w: 1080,
  h: 1350,
  background: { kind: "solid", color: "#fff" },
  elements: [
    { id: "h1", type: "text", x: 60, y: 80, w: 600, h: 120, rotation: 0, z: 1, slot: "headline", content: "Edited", fontFamily: "Inter", fontWeight: 700, size: 56, color: "#111", align: "left", lineHeight: 1.1 },
  ],
};

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/content/1/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/content/[id]/scene", () => {
  let cid: number;
  beforeAll(async () => {
    const [row] = await db
      .insert(schema.content)
      .values({
        mediaType: "image",
        targetSurface: "post",
        content: "orig",
        status: "draft",
        mediaUrl: "/api/media/old.png",
        scene: { w: 1080, h: 1350, background: { kind: "solid", color: "#000" }, elements: [] },
      })
      .returning();
    cid = row.id;
  });

  it("persists scene, re-renders PNG, updates media urls, snapshots prior scene", async () => {
    const res = await POST(makeReq({ scene: sampleScene }), {
      params: Promise.resolve({ id: String(cid) }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mediaUrl).toBe("/api/media/scene-stub.png");

    const [row] = await db.select().from(schema.content).where(eq(schema.content.id, cid));
    // scene is drizzle mode:"json" -> stored/read as a raw object.
    expect(row.scene).toMatchObject({ elements: [{ id: "h1", content: "Edited" }] });
    expect(row.mediaUrl).toBe("/api/media/scene-stub.png");
    expect(row.publicMediaUrl).toBe("/api/media/scene-stub.png");

    const revs = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.contentId, cid));
    expect(revs.length).toBe(1);
    expect(JSON.parse(revs[0].content)).toMatchObject({ background: { color: "#000" } });
  });

  it("404s for an unknown content id", async () => {
    const res = await POST(makeReq({ scene: sampleScene }), {
      params: Promise.resolve({ id: "999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s when scene is missing/invalid", async () => {
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: String(cid) }) });
    expect(res.status).toBe(400);
  });
});
