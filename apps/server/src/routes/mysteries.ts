import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { mysteries, players } from "../db/schema.js";
import { runGeneration } from "../services/generation/orchestrator.js";
import { mysteryId } from "../utils/ids.js";

const generateBody = z.object({
  player_id: z.string().min(1),
  category: z.enum(["missing-pet", "haunted-mansion", "stolen-treasure", "locked-room"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export async function mysteriesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/mysteries/generate", async (req, reply) => {
    const parsed = generateBody.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: "invalid_body", issues: parsed.error.issues };
    }
    const db = getDb();
    const player = db.select().from(players).where(eq(players.id, parsed.data.player_id)).get();
    if (!player) {
      reply.status(404);
      return { error: "player_not_found" };
    }
    const id = mysteryId();
    db.insert(mysteries).values({
      id,
      player_id: parsed.data.player_id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      status: "pending",
    }).run();

    void runGeneration({
      mysteryId: id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      playerName: player.name,
    });

    reply.status(202);
    return { mystery_id: id, status: "pending" };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id", async (req, reply) => {
    const db = getDb();
    const row = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    let characters: unknown = undefined;
    if (row.logic_structure_json) {
      try {
        const parsed = JSON.parse(row.logic_structure_json) as { characters?: unknown };
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.characters)) {
          characters = parsed.characters.map((c: Record<string, unknown>) => ({
            id: c.id, name: c.name, role: c.role, description: c.description,
          }));
        }
      } catch { /* swallow — surface as missing */ }
    }
    let narrative_annotations: unknown = null;
    if (row.status === "ready" && row.narrative_annotations) {
      try {
        narrative_annotations = JSON.parse(row.narrative_annotations);
      } catch { /* swallow — leave null so client renders plain prose */ }
    }
    return {
      id: row.id,
      player_id: row.player_id,
      category: row.category,
      difficulty: row.difficulty,
      status: row.status,
      title: row.title,
      narrative_text: row.status === "ready" ? row.narrative_text : null,
      narrative_annotations,
      audio_url: row.audio_path ? `/audio/${row.audio_path}` : null,
      characters,
      created_at: row.created_at,
      ready_at: row.ready_at,
      failure_reason: row.failure_reason,
    };
  });

  app.get<{ Querystring: { player_id?: string; limit?: string } }>("/mysteries", async (req, reply) => {
    const playerId = req.query.player_id;
    if (!playerId) {
      reply.status(400);
      return { error: "player_id required" };
    }
    const limit = Math.max(1, Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50));
    const db = getDb();
    const rows = db.select({
      id: mysteries.id,
      player_id: mysteries.player_id,
      category: mysteries.category,
      difficulty: mysteries.difficulty,
      status: mysteries.status,
      title: mysteries.title,
      created_at: mysteries.created_at,
      ready_at: mysteries.ready_at,
      solved: sql<number>`EXISTS (SELECT 1 FROM solutions WHERE solutions.mystery_id = ${mysteries.id} AND solutions.is_correct = 1)`,
    }).from(mysteries)
      .where(eq(mysteries.player_id, playerId))
      .orderBy(desc(mysteries.created_at))
      .limit(limit)
      .all();
    return {
      mysteries: rows.map((r) => ({ ...r, solved: r.solved === 1 })),
    };
  });
}
