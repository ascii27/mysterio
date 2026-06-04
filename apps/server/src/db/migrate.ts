import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, getSqlite } from "./client.js";

const db = getDb();
// Disable FK enforcement during migration. SQLite table rebuilds DROP the old table,
// whose implicit row-delete would otherwise fire ON DELETE CASCADE/SET NULL on existing
// child rows and destroy data (defer_foreign_keys does NOT prevent the cascade actions —
// only a connection-level foreign_keys=OFF, set outside any transaction, does). Migrations
// recreate the schema with the correct constraints; we re-enable enforcement afterward.
const sqlite = getSqlite();
sqlite.pragma("foreign_keys = OFF");
migrate(db, { migrationsFolder: "./src/db/migrations" });
sqlite.pragma("foreign_keys = ON");
console.log("migrations applied");
