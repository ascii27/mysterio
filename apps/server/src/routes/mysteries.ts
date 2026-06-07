import { and, desc, eq, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgeRange } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { mysteries, players, solutions, clues } from "../db/schema.js";
import { runGeneration } from "../services/generation/orchestrator.js";
import { runTtsAgent } from "../services/generation/agents/ttsAgent.js";
import { mysteryId } from "../utils/ids.js";
import { buildDebugView } from "./debugView.js";
import { resolveMysteryAudio } from "./mysteryAudio.js";

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
    const [player] = await db.select().from(players).where(eq(players.id, parsed.data.player_id)).limit(1);
    if (!player) {
      reply.status(404);
      return { error: "player_not_found" };
    }
    const id = mysteryId();
    await db.insert(mysteries).values({
      id,
      player_id: parsed.data.player_id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      target_age_range: player.age_range,
      status: "pending",
    });

    void runGeneration({
      mysteryId: id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      ageRange: player.age_range as AgeRange,
    });

    reply.status(202);
    return { mystery_id: id, status: "pending" };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id", async (req, reply) => {
    const db = getDb();
    const [row] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    let characters: unknown = undefined;
    let central_question: string | null = null;
    const ls = row.logic_structure_json;
    if (ls && typeof ls === "object") {
      if (Array.isArray((ls as { characters?: unknown }).characters)) {
        characters = (ls as { characters: { id: string; name: string; role: string; description: string }[] }).characters.map(
          (c: { id: string; name: string; role: string; description: string }) => ({
            id: c.id, name: c.name, role: c.role, description: c.description,
          })
        );
      }
      if (typeof (ls as { central_question?: unknown }).central_question === "string") {
        central_question = (ls as { central_question: string }).central_question;
      }
    }
    let narrative_annotations: unknown = null;
    if (row.status === "ready" && row.narrative_annotations) {
      narrative_annotations = row.narrative_annotations;
    }
    return {
      id: row.id,
      player_id: row.player_id,
      category: row.category,
      difficulty: row.difficulty,
      target_age_range: row.target_age_range,
      status: row.status,
      title: row.title,
      narrative_text: row.status === "ready" ? row.narrative_text : null,
      narrative_annotations,
      audio_url: row.audio_path ? `/audio/${row.audio_path}` : null,
      cover_image_url: row.cover_image_path ? `/images/${row.cover_image_path}` : null,
      characters,
      central_question,
      created_at: row.created_at,
      ready_at: row.ready_at,
      failure_reason: row.failure_reason,
    };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/debug", async (req, reply) => {
    const db = getDb();
    const [row] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    return buildDebugView({
      id: row.id,
      status: row.status,
      difficulty: row.difficulty,
      failure_reason: row.failure_reason,
      logic_structure_json: row.logic_structure_json,
      narrative_text: row.narrative_text,
      validation_passed: row.validation_passed,
      validation_attempts: row.validation_attempts,
      validation_notes: row.validation_notes,
    });
  });

  app.post<{ Params: { id: string } }>("/mysteries/:id/audio", async (req, reply) => {
    const db = getDb();
    const [row] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    const outcome = await resolveMysteryAudio(row, {
      generateAudio: async (id, narrativeText) => {
        const r = await runTtsAgent({ mysteryId: id, narrativeText });
        return r.ok ? { ok: true, audioPath: r.audioPath } : { ok: false, error: r.error };
      },
      persistAudioPath: async (id, audioPath) => {
        await db.update(mysteries).set({ audio_path: audioPath }).where(eq(mysteries.id, id));
      },
    });
    reply.status(outcome.status);
    return outcome.body;
  });

  app.get<{ Querystring: { player_id?: string; limit?: string } }>("/mysteries", async (req, reply) => {
    const playerId = req.query.player_id;
    if (!playerId) {
      reply.status(400);
      return { error: "player_id required" };
    }
    const limit = Math.max(1, Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50));
    const db = getDb();
    // Use LEFT JOINs instead of correlated subqueries for pg-mem compatibility.
    // sol_correct: join on solved solution; sol_any: join on any solution; clue_any: join on any clue.
    // SELECT DISTINCT so each LEFT JOIN is strictly 1:0-or-1 per mystery — without it,
    // a player with multiple clues (or solutions) on one mystery fans the join out,
    // duplicating mystery rows and breaking the LIMIT distinct-mystery count.
    const sol_correct = db.$with("sol_correct").as(
      db.selectDistinct({ mystery_id: solutions.mystery_id })
        .from(solutions)
        .where(and(eq(solutions.player_id, playerId), eq(solutions.is_correct, true)))
    );
    const sol_any = db.$with("sol_any").as(
      db.selectDistinct({ mystery_id: solutions.mystery_id })
        .from(solutions)
        .where(eq(solutions.player_id, playerId))
    );
    const clue_any = db.$with("clue_any").as(
      db.selectDistinct({ mystery_id: clues.mystery_id })
        .from(clues)
        .where(eq(clues.player_id, playerId))
    );
    const rows = await db
      .with(sol_correct, sol_any, clue_any)
      .select({
        id: mysteries.id,
        player_id: mysteries.player_id,
        category: mysteries.category,
        difficulty: mysteries.difficulty,
        target_age_range: mysteries.target_age_range,
        status: mysteries.status,
        title: mysteries.title,
        created_at: mysteries.created_at,
        ready_at: mysteries.ready_at,
        solved: sql<boolean>`(${sol_correct.mystery_id} IS NOT NULL)`,
        started: sql<boolean>`(${sol_any.mystery_id} IS NOT NULL OR ${clue_any.mystery_id} IS NOT NULL)`,
      })
      .from(mysteries)
      .leftJoin(sol_correct, eq(sol_correct.mystery_id, mysteries.id))
      .leftJoin(sol_any, eq(sol_any.mystery_id, mysteries.id))
      .leftJoin(clue_any, eq(clue_any.mystery_id, mysteries.id))
      .where(or(eq(mysteries.status, "ready"), eq(mysteries.player_id, playerId)))
      .orderBy(desc(mysteries.created_at))
      .limit(limit);
    return {
      mysteries: rows.map((r) => ({ ...r })),
    };
  });
}
