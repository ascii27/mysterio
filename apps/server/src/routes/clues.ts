import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { clues } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  category_type: z.enum(["character", "item", "location", "event", "note"]),
  content: z.string().min(1).max(500),
  audio_timestamp_ms: z.number().int().nonnegative().optional(),
});

const patchBody = z.object({
  content: z.string().min(1).max(500),
});

export async function cluesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const id = shortId();
    db.insert(clues).values({
      id,
      mystery_id: req.params.id,
      category_type: parsed.data.category_type,
      content: parsed.data.content,
      audio_timestamp_ms: parsed.data.audio_timestamp_ms ?? null,
    }).run();
    reply.status(201);
    const row = db.select().from(clues).where(eq(clues.id, id)).get();
    return { clue: row };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/clues", async (req) => {
    const db = getDb();
    const rows = db.select().from(clues).where(eq(clues.mystery_id, req.params.id)).all();
    return { clues: rows };
  });

  app.patch<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    db.update(clues).set({ content: parsed.data.content }).where(eq(clues.id, req.params.clueId)).run();
    const row = db.select().from(clues).where(eq(clues.id, req.params.clueId)).get();
    if (!row) { reply.status(404); return { error: "not_found" }; }
    return { clue: row };
  });

  app.delete<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const db = getDb();
    db.delete(clues).where(eq(clues.id, req.params.clueId)).run();
    reply.status(204);
  });
}
