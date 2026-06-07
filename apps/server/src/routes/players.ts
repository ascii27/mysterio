import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { mysteries, players, solutions } from "../db/schema.js";
import { DIFFICULTY_POINTS, reputationFor, type DifficultyId, type PlayerReputation } from "@mysterio/shared";
import { runAvatarImageAgent } from "../services/images/avatarImageAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";
import { shortId } from "../utils/ids.js";

/** Points + solved-count per detective, derived from their correct solutions. */
async function reputationByPlayer(): Promise<Map<string, PlayerReputation>> {
  const db = getDb();
  const solved = await db
    .select({ player_id: solutions.player_id, difficulty: mysteries.difficulty })
    .from(solutions)
    .innerJoin(mysteries, eq(solutions.mystery_id, mysteries.id))
    .where(eq(solutions.is_correct, true));
  const points = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of solved) {
    // difficulty is a string column constrained to DifficultyId values on the insert path
    points.set(r.player_id, (points.get(r.player_id) ?? 0) + (DIFFICULTY_POINTS[r.difficulty as DifficultyId] ?? 0));
    counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);
  }
  const out = new Map<string, PlayerReputation>();
  for (const [pid, pts] of points) {
    out.set(pid, { ...reputationFor(pts), solved_count: counts.get(pid) ?? 0 });
  }
  return out;
}

const ROOKIE: PlayerReputation = { ...reputationFor(0), solved_count: 0 };

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
    const rows = await db.select().from(players);
    const reps = await reputationByPlayer();
    return { players: rows.map((p) => ({ ...p, reputation: reps.get(p.id) ?? ROOKIE })) };
  });

  app.post("/players", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const id = shortId();
    const avatar_description = parsed.data.avatar_description?.trim() ? parsed.data.avatar_description.trim() : null;
    await db.insert(players).values({
      id,
      name: parsed.data.name,
      age_range: parsed.data.age_range,
      default_difficulty: parsed.data.default_difficulty,
      avatar_description,
    });
    const [row] = await db.select().from(players).where(eq(players.id, id)).limit(1);
    reply.status(201);
    return { player: row };
  });

  app.patch<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const [existing] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!existing) { reply.status(404); return { error: "player_not_found" }; }

    const patch: Partial<typeof players.$inferInsert> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.age_range !== undefined) patch.age_range = parsed.data.age_range;
    if (parsed.data.default_difficulty !== undefined) patch.default_difficulty = parsed.data.default_difficulty;
    if (parsed.data.avatar_description !== undefined) {
      patch.avatar_description = parsed.data.avatar_description.trim() ? parsed.data.avatar_description.trim() : null;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(players).set(patch).where(eq(players.id, req.params.id));
    }
    const [row] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    return { player: row };
  });

  app.delete<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const db = getDb();
    await db.delete(players).where(eq(players.id, req.params.id));
    reply.status(204);
  });

  app.post<{ Params: { id: string } }>("/players/:id/avatar", async (req, reply) => {
    const db = getDb();
    const [player] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!player) { reply.status(404); return { error: "player_not_found" }; }
    const description = player.avatar_description?.trim();
    if (!description) { reply.status(400); return { error: "no_description" }; }

    const result = await runAvatarImageAgent({ playerId: player.id, description });
    if (!result.ok) { reply.status(502); return { error: "avatar_generation_failed", detail: result.error }; }

    const previousKey = player.avatar_image_path;
    await db.update(players).set({ avatar_image_path: result.avatarImagePath }).where(eq(players.id, player.id));
    if (previousKey && previousKey !== result.avatarImagePath) {
      await deleteImageByKey(previousKey); // best-effort cleanup of the prior version
    }
    const [row] = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
    return { player: row };
  });

  app.get<{ Params: { id: string } }>("/players/:id/trophies", async (req) => {
    const db = getDb();
    const rows = await db
      .select({
        mystery_id: mysteries.id,
        title: mysteries.title,
        cover_image_path: mysteries.cover_image_path,
        difficulty: mysteries.difficulty,
        logic: mysteries.logic_structure_json,
        solved_at: solutions.created_at,
      })
      .from(solutions)
      .innerJoin(mysteries, eq(solutions.mystery_id, mysteries.id))
      .where(and(
        eq(solutions.player_id, req.params.id),
        eq(solutions.is_correct, true),
        eq(mysteries.status, "ready"),
      ));

    const trophies = rows
      .map((r) => {
        let culprit_name: string | null = null;
        let how: string | null = null;
        const ls = r.logic;
        if (ls) {
          how = typeof ls.true_solution?.how === "string" ? ls.true_solution.how : null;
          const who = ls.true_solution?.who_did_it;
          culprit_name = ls.characters?.find((c) => c.id === who)?.name ?? null;
        }
        return {
          mystery_id: r.mystery_id,
          title: r.title,
          cover_image_path: r.cover_image_path,
          difficulty: r.difficulty,
          solved_at: r.solved_at,
          culprit_name,
          how,
        };
      })
      .sort((a, b) => b.solved_at.getTime() - a.solved_at.getTime());

    return { trophies };
  });
}
