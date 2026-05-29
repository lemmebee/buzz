import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Scene } from "@/lib/compose/scene";

const TEST_NAME = "__schema_scene_test__";
const insertedProductIds: number[] = [];
const insertedContentIds: number[] = [];

afterAll(() => {
  for (const id of insertedContentIds) {
    db.delete(schema.content).where(eq(schema.content.id, id)).run();
  }
  for (const id of insertedProductIds) {
    db.delete(schema.products).where(eq(schema.products.id, id)).run();
  }
});

describe("schema: brandKit + scene columns", () => {
  it("round-trips a scene JSON on content", () => {
    const scene: Scene = {
      w: 1080,
      h: 1350,
      background: { kind: "solid", color: "#101014" },
      elements: [
        {
          id: "h1",
          type: "text",
          x: 80,
          y: 200,
          w: 920,
          h: 300,
          rotation: 0,
          z: 1,
          slot: "headline",
          content: "Hello",
          fontFamily: "Inter",
          fontWeight: 700,
          size: 96,
          color: "#ffffff",
          align: "left",
          lineHeight: 1.05,
        },
      ],
    };

    const prod = db
      .insert(schema.products)
      .values({ name: TEST_NAME, description: "fixture" })
      .returning({ id: schema.products.id })
      .all()[0];
    insertedProductIds.push(prod.id);

    const row = db
      .insert(schema.content)
      .values({
        productId: prod.id,
        mediaType: "image",
        targetSurface: "post",
        content: "caption",
        scene,
      })
      .returning({ id: schema.content.id })
      .all()[0];
    insertedContentIds.push(row.id);

    const read = db
      .select({ scene: schema.content.scene })
      .from(schema.content)
      .where(eq(schema.content.id, row.id))
      .all()[0];

    const readScene = read.scene as Scene;
    expect(readScene.w).toBe(1080);
    expect(readScene.background).toEqual({ kind: "solid", color: "#101014" });
    expect(readScene.elements[0].slot).toBe("headline");
  });

  it("round-trips brandKit JSON + timestamp on products", () => {
    const at = new Date();
    const brandKit = { palette: { bg: "#000", accents: ["#f00"] }, mood: ["bold"] };

    const prod = db
      .insert(schema.products)
      .values({
        name: TEST_NAME,
        description: "fixture",
        brandKit,
        brandKitUpdatedAt: at,
      })
      .returning({ id: schema.products.id })
      .all()[0];
    insertedProductIds.push(prod.id);

    const read = db
      .select({
        brandKit: schema.products.brandKit,
        brandKitUpdatedAt: schema.products.brandKitUpdatedAt,
      })
      .from(schema.products)
      .where(eq(schema.products.id, prod.id))
      .all()[0];

    expect((read.brandKit as { mood: string[] }).mood).toEqual(["bold"]);
    expect(read.brandKitUpdatedAt instanceof Date).toBe(true);
    expect(read.brandKitUpdatedAt?.getTime()).toBe(
      Math.floor(at.getTime() / 1000) * 1000,
    );
  });
});
