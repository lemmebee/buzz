import { describe, it, expect, beforeAll } from "vitest";
import { db, schema } from "@/lib/db";
import { GET } from "@/app/api/content/[id]/scene/route";

describe("GET /api/content/[id]/scene", () => {
  let withScene: number;
  let noScene: number;
  const scene = { w: 1080, h: 1350, background: { kind: "solid", color: "#abc" }, elements: [] };

  beforeAll(async () => {
    const [a] = await db
      .insert(schema.content)
      // scene is drizzle mode:"json" -> store the raw object.
      .values({ mediaType: "image", targetSurface: "post", content: "a", status: "draft", scene })
      .returning();
    withScene = a.id;
    const [b] = await db
      .insert(schema.content)
      .values({ mediaType: "image", targetSurface: "post", content: "b", status: "draft", scene: null })
      .returning();
    noScene = b.id;
  });

  it("returns the parsed scene + brandKit fields", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(withScene) }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scene).toMatchObject({ background: { color: "#abc" } });
  });

  it("returns scene:null when the row has no scene", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(noScene) }) });
    expect(res.status).toBe(200);
    expect((await res.json()).scene).toBeNull();
  });

  it("404s for unknown id", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
  });
});
