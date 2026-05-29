import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import Database from "better-sqlite3";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Isolate tests from the real dev DB. Build a schema-only temp database (tables +
// indexes copied from the real DB, NO data) and point the app at it via BUZZ_DB_PATH,
// before any test imports @/lib/db. Without this, tests that hit the DB would write
// junk rows into ./data/buzz.db.
if (!process.env.BUZZ_DB_PATH) {
  const tmpFile = join(mkdtempSync(join(tmpdir(), "buzz-test-")), "test.db");
  try {
    const src = new Database("./data/buzz.db", { readonly: true });
    const ddl = src
      .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index')")
      .all() as { sql: string }[];
    src.close();
    const dst = new Database(tmpFile);
    for (const { sql } of ddl) {
      try {
        dst.exec(sql);
      } catch {
        /* skip any statement the fresh DB cannot replay */
      }
    }
    dst.close();
  } catch {
    /* real DB absent: the app will create a fresh temp DB on first open */
  }
  process.env.BUZZ_DB_PATH = tmpFile;
}

// Unmount React trees between tests so jsdom queries don't see leaked DOM.
afterEach(() => {
  cleanup();
});
