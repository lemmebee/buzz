import { mkdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

mkdirSync("./data", { recursive: true });

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/buzz.db",
  },
});
