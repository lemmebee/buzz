import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { products } from "../drizzle/schema";

const sqlite = new Database("./data/buzz.db");
const db = drizzle(sqlite);

async function seed() {
  console.log("Seeding database...");

  // Check if Bud already exists
  const existing = db.select().from(products).all();
  if (existing.length > 0) {
    console.log("Products already exist, skipping seed.");
    return;
  }

  // Insert Bud product
  db.insert(products).values({
    name: "Bud",
    description: "Cannabis relationship companion. Helps people understand and navigate their relationship with weed - whether they want to quit, reduce, use mindfully, or understand patterns.",
    url: "https://example.com/bud",
    audience: "Cannabis users 18-35 curious about their habits",
    tone: "warm",
  }).run();

  console.log("Seeded Bud product.");
}

seed().catch(console.error);
