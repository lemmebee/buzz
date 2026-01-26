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
    features: JSON.stringify([
      "Track consumption without judgment",
      "Discover usage patterns",
      "Flexible goals (quit, reduce, or just understand)",
      "Privacy-first - local storage",
    ]),
    audience: "Cannabis users 18-35 curious about their habits",
    tone: "warm",
    themes: JSON.stringify([
      "Curious about your cannabis habits?",
      "Not trying to quit, just understand",
      "Your relationship with weed, on your terms",
      "Data without judgment",
      "Meet yourself where you are",
    ]),
  }).run();

  console.log("Seeded Bud product.");
}

seed().catch(console.error);
