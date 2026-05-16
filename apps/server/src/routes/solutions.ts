import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runExplanation } from "../services/generation/agents/explanationAgent.js";
import { runGrader } from "../services/generation/agents/graderAgent.js";
import { shortId } from "../utils/ids.js";

const submitBody = z.object({
  guess_who: z.string().min(1),
  guess_how: z.string().min(1).max(400),
  guess_why: z.string().min(1).max(400),
});

export async function solutionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/submit-solution", async (req, reply) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const who_match = parsed.data.guess_who === ls.true_solution.who_did_it;
    const [howGrade, whyGrade] = await Promise.all([
      runGrader(parsed.data.guess_how, ls.true_solution.how),
      runGrader(parsed.data.guess_why, ls.true_solution.why),
    ]);
    const is_correct = who_match && howGrade.match && whyGrade.match;
    const outcome: "correct" | "partial" | "incorrect" =
      is_correct ? "correct" :
      (who_match || howGrade.match || whyGrade.match) ? "partial" : "incorrect";

    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: parsed.data.guess_who, how: parsed.data.guess_how, why: parsed.data.guess_why },
      outcome,
    });

    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();

    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: parsed.data.guess_who,
      guess_how: parsed.data.guess_how,
      guess_why: parsed.data.guess_why,
      is_correct: is_correct ? 1 : 0,
      who_match: who_match ? 1 : 0,
      how_match: howGrade.match ? 1 : 0,
      why_match: whyGrade.match ? 1 : 0,
      hints_used: hintRow.length,
      gave_up: 0,
      explanation,
    }).run();

    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.post<{ Params: { id: string } }>("/mysteries/:id/give-up", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: null, how: null, why: null },
      outcome: "gave_up",
    });
    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();
    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: null, guess_how: null, guess_why: null,
      is_correct: 0,
      who_match: null, how_match: null, why_match: null,
      hints_used: hintRow.length,
      gave_up: 1,
      explanation,
    }).run();
    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/solution", async (req, reply) => {
    const r = solutionResponse(req.params.id);
    if (!r) { reply.status(404); return { error: "not_found" }; }
    return r;
  });
}

function solutionResponse(mysteryId: string) {
  const db = getDb();
  const myst = db.select().from(mysteries).where(eq(mysteries.id, mysteryId)).get();
  if (!myst || !myst.logic_structure_json) return null;
  const sol = db.select().from(solutions).where(eq(solutions.mystery_id, mysteryId)).get();
  const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
  return {
    solution: sol ?? null,
    true_solution: sol ? ls.true_solution : null,
    characters: ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    explanation: sol?.explanation ?? null,
  };
}
