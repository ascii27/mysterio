import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runHintAgent } from "../services/generation/agents/hintAgent.js";
import { shortId } from "../utils/ids.js";

const MAX_HINTS = 2;

export async function hintsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const sol = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (sol) { reply.status(409); return { error: "already_solved" }; }
    const prior = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();
    if (prior.length >= MAX_HINTS) {
      reply.status(409);
      return { error: "hint_limit_reached", limit: MAX_HINTS };
    }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const content = await runHintAgent({
      logicStructure: ls,
      priorHints: prior.map((h) => h.content),
    });

    const id = shortId();
    db.insert(hints).values({ id, mystery_id: myst.id, content }).run();
    const row = db.select().from(hints).where(eq(hints.id, id)).get();
    reply.status(201);
    return { hint: row, remaining: MAX_HINTS - (prior.length + 1) };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/hints", async (req) => {
    const db = getDb();
    const rows = db.select().from(hints).where(eq(hints.mystery_id, req.params.id)).all();
    return { hints: rows, remaining: Math.max(0, MAX_HINTS - rows.length) };
  });
}
