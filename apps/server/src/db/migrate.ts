import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./client.js";

await migrate(getDb(), { migrationsFolder: "./src/db/migrations" });
console.log("migrations applied");
process.exit(0);
