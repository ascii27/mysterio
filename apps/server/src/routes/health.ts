import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    let dbOk = false;
    try {
      await getDb().execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { ok: true, db: dbOk };
  });
}
