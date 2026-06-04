import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnv } from "../config/env.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function getDb() {
  if (_db) return _db;
  const env = loadEnv();
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  _sqlite = new Database(env.DATABASE_PATH);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getSqlite(): Database.Database {
  getDb();
  if (!_sqlite) throw new Error("sqlite not initialised");
  return _sqlite;
}

/** Test-only: inject an already-migrated DB (see src/test/db.ts). */
export function __setTestDb(
  db: ReturnType<typeof drizzle<typeof schema>>,
  sqlite: Database.Database,
): void {
  _db = db;
  _sqlite = sqlite;
}
