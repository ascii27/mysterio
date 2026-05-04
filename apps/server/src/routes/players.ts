import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";

export async function playersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/players", async () => {
    const db = getDb();
    const rows = db.select().from(players).all();
    return { players: rows };
  });
}
