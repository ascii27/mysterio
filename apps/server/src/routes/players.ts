import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  name: z.string().trim().min(1).max(24),
  age_range: z.enum(["8-9", "10-11", "12-13"]),
  default_difficulty: z.enum(["easy", "medium", "hard"]),
  avatar_description: z.string().max(300).optional(),
});

export async function playersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/players", async () => {
    const db = getDb();
    const rows = db.select().from(players).all();
    return { players: rows };
  });

  app.post("/players", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const id = shortId();
    const avatar_description = parsed.data.avatar_description?.trim() ? parsed.data.avatar_description.trim() : null;
    db.insert(players).values({
      id,
      name: parsed.data.name,
      age_range: parsed.data.age_range,
      default_difficulty: parsed.data.default_difficulty,
      avatar_description,
    }).run();
    const row = db.select().from(players).where(eq(players.id, id)).get();
    reply.status(201);
    return { player: row };
  });

  app.delete<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const db = getDb();
    db.delete(players).where(eq(players.id, req.params.id)).run();
    reply.status(204);
  });
}
