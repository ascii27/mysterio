import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./client.js";

const db = getDb();
migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("migrations applied");
