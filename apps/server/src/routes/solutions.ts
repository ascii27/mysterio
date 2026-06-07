import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runExplanation } from "../services/generation/agents/explanationAgent.js";
import { shortId } from "../utils/ids.js";

const submitBody = z.object({
  player_id: z.string().min(1),
  guess_who: z.string().min(1),
  guess_how: z.string().min(1).max(400),
  guess_why: z.string().min(1).max(400),
});

const playerQuery = z.object({ player_id: z.string().min(1) });

export async function solutionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/submit-solution", async (req, reply) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const [myst] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const playerId = parsed.data.player_id;
    const [existing] = await db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, playerId))).limit(1);
    if (existing) { reply.status(409); return { error: "already_solved" }; }

    const ls = myst.logic_structure_json as LogicStructure;
    // M6: HOW and WHY are multi-choice — kid's pick must exactly equal the true value
    // (no more LLM grader; the LLM-authored option list guarantees one correct choice).
    const who_match = parsed.data.guess_who === ls.true_solution.who_did_it;
    const how_match = parsed.data.guess_how === ls.true_solution.how;
    const why_match = parsed.data.guess_why === ls.true_solution.why;
    const is_correct = who_match && how_match && why_match;
    const outcome: "correct" | "partial" | "incorrect" =
      is_correct ? "correct" :
      (who_match || how_match || why_match) ? "partial" : "incorrect";

    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: parsed.data.guess_who, how: parsed.data.guess_how, why: parsed.data.guess_why },
      outcome,
    });

    const hintRow = await db.select().from(hints)
      .where(and(eq(hints.mystery_id, myst.id), eq(hints.player_id, playerId)));

    await db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      player_id: playerId,
      guess_who: parsed.data.guess_who,
      guess_how: parsed.data.guess_how,
      guess_why: parsed.data.guess_why,
      is_correct,
      who_match,
      how_match,
      why_match,
      hints_used: hintRow.length,
      gave_up: false,
      explanation,
    });

    reply.status(201);
    return await solutionResponse(myst.id, playerId);
  });

  app.post<{ Params: { id: string } }>("/mysteries/:id/give-up", async (req, reply) => {
    const pid = z.object({ player_id: z.string().min(1) }).safeParse(req.body);
    if (!pid.success) { reply.status(400); return { error: "player_id required" }; }
    const playerId = pid.data.player_id;
    const db = getDb();
    const [myst] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const [existing] = await db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, playerId))).limit(1);
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = myst.logic_structure_json as LogicStructure;
    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: null, how: null, why: null },
      outcome: "gave_up",
    });
    const hintRow = await db.select().from(hints)
      .where(and(eq(hints.mystery_id, myst.id), eq(hints.player_id, playerId)));
    await db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      player_id: playerId,
      guess_who: null, guess_how: null, guess_why: null,
      is_correct: false,
      who_match: null, how_match: null, why_match: null,
      hints_used: hintRow.length,
      gave_up: true,
      explanation,
    });
    reply.status(201);
    return await solutionResponse(myst.id, playerId);
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/solution", async (req, reply) => {
    const parsed = playerQuery.safeParse(req.query);
    if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
    const r = await solutionResponse(req.params.id, parsed.data.player_id);
    if (!r) { reply.status(404); return { error: "not_found" }; }
    return r;
  });

  // M6: pre-solve, the kid needs the (shuffled) multi-choice options for HOW and WHY,
  // plus the cast of characters to pick from for WHO. Detective excluded; role hidden.
  app.get<{ Params: { id: string } }>("/mysteries/:id/solve-options", async (req, reply) => {
    const parsed = playerQuery.safeParse(req.query);
    if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
    const db = getDb();
    const [myst] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const [existing] = await db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, parsed.data.player_id))).limit(1);
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = myst.logic_structure_json as LogicStructure;
    return {
      characters: ls.characters
        .filter((c) => c.role !== "detective")
        .map((c) => ({ id: c.id, name: c.name })),
      how_options: shuffle([ls.true_solution.how, ...ls.how_distractors]),
      why_options: shuffle([ls.true_solution.why, ...ls.why_distractors]),
    };
  });
}

async function solutionResponse(mysteryId: string, playerId: string) {
  const db = getDb();
  const [myst] = await db.select().from(mysteries).where(eq(mysteries.id, mysteryId)).limit(1);
  if (!myst || !myst.logic_structure_json) return null;
  const [sol] = await db.select().from(solutions)
    .where(and(eq(solutions.mystery_id, mysteryId), eq(solutions.player_id, playerId))).limit(1);
  const ls = myst.logic_structure_json as LogicStructure;
  return {
    solution: sol ?? null,
    true_solution: sol ? ls.true_solution : null,
    characters: ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    explanation: sol?.explanation ?? null,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = copy[i] as T;
    const aj = copy[j] as T;
    copy[i] = aj;
    copy[j] = ai;
  }
  return copy;
}
