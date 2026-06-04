import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { runAvatarImageAgent } from "../services/images/avatarImageAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  name: z.string().trim().min(1).max(24),
  age_range: z.enum(["8-9", "10-11", "12-13"]),
  default_difficulty: z.enum(["easy", "medium", "hard"]),
  avatar_description: z.string().max(300).optional(),
});

const patchBody = createBody.partial();

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

  app.patch<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const existing = db.select().from(players).where(eq(players.id, req.params.id)).get();
    if (!existing) { reply.status(404); return { error: "player_not_found" }; }

    const patch: Partial<typeof players.$inferInsert> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.age_range !== undefined) patch.age_range = parsed.data.age_range;
    if (parsed.data.default_difficulty !== undefined) patch.default_difficulty = parsed.data.default_difficulty;
    if (parsed.data.avatar_description !== undefined) {
      patch.avatar_description = parsed.data.avatar_description.trim() ? parsed.data.avatar_description.trim() : null;
    }
    if (Object.keys(patch).length > 0) {
      db.update(players).set(patch).where(eq(players.id, req.params.id)).run();
    }
    const row = db.select().from(players).where(eq(players.id, req.params.id)).get();
    return { player: row };
  });

  app.delete<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const db = getDb();
    db.delete(players).where(eq(players.id, req.params.id)).run();
    reply.status(204);
  });

  app.post<{ Params: { id: string } }>("/players/:id/avatar", async (req, reply) => {
    const db = getDb();
    const player = db.select().from(players).where(eq(players.id, req.params.id)).get();
    if (!player) { reply.status(404); return { error: "player_not_found" }; }
    const description = player.avatar_description?.trim();
    if (!description) { reply.status(400); return { error: "no_description" }; }

    const result = await runAvatarImageAgent({ playerId: player.id, description });
    if (!result.ok) { reply.status(502); return { error: "avatar_generation_failed", detail: result.error }; }

    const previousKey = player.avatar_image_path;
    db.update(players).set({ avatar_image_path: result.avatarImagePath }).where(eq(players.id, player.id)).run();
    if (previousKey && previousKey !== result.avatarImagePath) {
      await deleteImageByKey(previousKey); // best-effort cleanup of the prior version
    }
    const row = db.select().from(players).where(eq(players.id, player.id)).get();
    return { player: row };
  });
}
