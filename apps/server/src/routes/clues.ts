import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { clues } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  category_type: z.enum(["character", "item", "location", "event", "note"]),
  content: z.string().min(1).max(500),
  audio_timestamp_ms: z.number().int().nonnegative().optional(),
  source: z.enum(["manual", "annotation"]).optional(),
  annotation_id: z.string().min(1).max(120).optional(),
}).refine(
  (b) => !(b.source === "annotation") || (typeof b.annotation_id === "string"),
  { message: "annotation_id required when source is 'annotation'" },
);

const patchBody = z.object({
  content: z.string().min(1).max(500),
});

export async function cluesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const source = parsed.data.source ?? "manual";
    const annotation_id = parsed.data.annotation_id ?? null;

    // Dedupe annotation-sourced clues by (mystery_id, annotation_id) so re-taps return the existing row.
    if (source === "annotation" && annotation_id) {
      const existing = db.select().from(clues)
        .where(and(eq(clues.mystery_id, req.params.id), eq(clues.annotation_id, annotation_id)))
        .get();
      if (existing) {
        reply.status(200);
        return { clue: existing };
      }
    }

    const id = shortId();
    db.insert(clues).values({
      id,
      mystery_id: req.params.id,
      category_type: parsed.data.category_type,
      content: parsed.data.content,
      audio_timestamp_ms: parsed.data.audio_timestamp_ms ?? null,
      source,
      annotation_id,
    }).run();
    const row = db.select().from(clues).where(eq(clues.id, id)).get();
    if (!row) { reply.status(500); return { error: "internal_server_error" }; }
    reply.status(201);
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
    const where = and(eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id));
    db.update(clues).set({ content: parsed.data.content }).where(where).run();
    const row = db.select().from(clues).where(where).get();
    if (!row) { reply.status(404); return { error: "not_found" }; }
    return { clue: row };
  });

  app.delete<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const db = getDb();
    db.delete(clues).where(and(eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id))).run();
    reply.status(204);
  });
}
