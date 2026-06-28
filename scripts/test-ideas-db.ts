// Phase 3 persistence verification: insert/list/delete brainstorm ideas against the dev DB.
// Run: npx tsx scripts/test-ideas-db.ts
import { db, schema } from "../src/lib/db";
import { eq, desc, and, inArray } from "drizzle-orm";

async function main() {
  // Use a real product (FKs are enforced); create a temp one if none exist.
  const existing = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
  let productId: number;
  let tempProduct = false;
  if (existing.length) {
    productId = existing[0].id;
  } else {
    const [p] = await db.insert(schema.products).values({ name: "__test__", description: "__test__" }).returning();
    productId = p.id;
    tempProduct = true;
  }

  const inserted = await db
    .insert(schema.brainstormIdeas)
    .values([
      { productId, title: "Idea A", kind: "post", hook: "hook a", whyItWorks: "w", format: "Reel", riskiestAssumption: "r", noveltyScore: 4, fitScore: 5, feasibilityScore: 3, theme: "launch" },
      { productId, title: "Idea B", kind: "campaign", hook: "hook b", noveltyScore: 5, fitScore: 4, feasibilityScore: 2 },
    ])
    .returning();
  const myIds = inserted.map((r) => r.id);

  const rows = await db
    .select()
    .from(schema.brainstormIdeas)
    .where(eq(schema.brainstormIdeas.productId, productId))
    .orderBy(desc(schema.brainstormIdeas.createdAt), desc(schema.brainstormIdeas.id));
  const mine = rows.filter((r) => myIds.includes(r.id)); // newest are first; mine lead the list

  // delete the newest of mine
  await db.delete(schema.brainstormIdeas).where(and(eq(schema.brainstormIdeas.id, mine[0].id), eq(schema.brainstormIdeas.productId, productId)));
  const afterMine = (await db.select().from(schema.brainstormIdeas).where(inArray(schema.brainstormIdeas.id, myIds)));

  // cleanup
  await db.delete(schema.brainstormIdeas).where(inArray(schema.brainstormIdeas.id, myIds));
  if (tempProduct) await db.delete(schema.products).where(eq(schema.products.id, productId));
  const finalMine = await db.select().from(schema.brainstormIdeas).where(inArray(schema.brainstormIdeas.id, myIds));

  const bIdx = mine.findIndex((r) => r.title === "Idea B");
  const aIdx = mine.findIndex((r) => r.title === "Idea A");
  const checks = {
    "inserted 2 + returning() gives ids": inserted.length === 2 && myIds.every((i) => typeof i === "number"),
    "both mine listed for product": mine.length === 2,
    "newest-first ordering (B before A)": bIdx !== -1 && aIdx !== -1 && bIdx < aIdx,
    "createdAt is a Date": mine[0].createdAt instanceof Date,
    "nullable cols persist as null": mine.some((r) => r.whyItWorks === null),
    "delete one leaves 1 of mine": afterMine.length === 1,
    "cleanup leaves 0 of mine": finalMine.length === 0,
  };

  let ok = true;
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  console.log(`\n${ok ? "DB ROUNDTRIP PASS" : "DB ROUNDTRIP FAIL"}`);
  process.exit(ok ? 0 : 1);
}

main();
