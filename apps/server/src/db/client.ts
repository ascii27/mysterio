import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadEnv } from "../config/env.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: Pool | null = null;

export function getDb() {
  if (_db) return _db;
  const env = loadEnv();
  _pool = new Pool({ connectionString: env.DATABASE_URL });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Test-only: inject an already-migrated drizzle instance (see src/test/db.ts). */
export function __setTestDb(db: ReturnType<typeof drizzle<typeof schema>>): void {
  _db = db;
}
