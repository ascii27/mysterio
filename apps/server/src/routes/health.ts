import type { FastifyInstance } from "fastify";
import { getSqlite } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    let dbOk = false;
    try {
      getSqlite().prepare("SELECT 1").run();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { ok: true, db: dbOk };
  });
}
