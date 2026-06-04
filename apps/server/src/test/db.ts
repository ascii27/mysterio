import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { __setTestDb } from "../db/client.js";
import * as schema from "../db/schema.js";

/** Fresh in-memory SQLite with all migrations applied, injected into getDb(). Call in beforeEach. */
export function setupTestDb() {
  const sqlite = new Database(":memory:");
  // FK OFF during migrate (table rebuilds would otherwise cascade-delete) — mirrors migrate.ts.
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  sqlite.pragma("foreign_keys = ON"); // enforce cascades at runtime in tests
  __setTestDb(db, sqlite);
  return { db, sqlite };
}
