import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../drizzle/schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// BUZZ_DB_PATH lets tests (and other tooling) point at an isolated DB so they
// never mutate the real dev database. Defaults to the app DB.
const dbPath = process.env.BUZZ_DB_PATH || "./data/buzz.db";

// Ensure data directory exists
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export { schema };
