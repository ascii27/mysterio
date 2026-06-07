import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runHintAgent } from "../services/generation/agents/hintAgent.js";
import { shortId } from "../utils/ids.js";

const MAX_HINTS = 2;
const playerQuery = z.object({ player_id: z.string().min(1) });
const playerBody = z.object({ player_id: z.string().min(1) });

export async function hintsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const pid = playerBody.safeParse(req.body);
    if (!pid.success) { reply.status(400); return { error: "player_id required" }; }
    const playerId = pid.data.player_id;
    const db = getDb();
    const [myst] = await db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).limit(1);
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const [sol] = await db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, playerId))).limit(1);
    if (sol) { reply.status(409); return { error: "already_solved" }; }
    const prior = await db.select().from(hints)
      .where(and(eq(hints.mystery_id, myst.id), eq(hints.player_id, playerId)));
    if (prior.length >= MAX_HINTS) { reply.status(409); return { error: "hint_limit_reached", limit: MAX_HINTS }; }

    const ls = myst.logic_structure_json as unknown as LogicStructure;
    const content = await runHintAgent({ logicStructure: ls, priorHints: prior.map((h) => h.content) });

    const id = shortId();
    await db.insert(hints).values({ id, mystery_id: myst.id, player_id: playerId, content });
    const [row] = await db.select().from(hints).where(eq(hints.id, id)).limit(1);
    reply.status(201);
    return { hint: row, remaining: MAX_HINTS - (prior.length + 1) };
  });

  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const parsed = playerQuery.safeParse(req.query);
    if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
    const db = getDb();
    const rows = await db.select().from(hints)
      .where(and(eq(hints.mystery_id, req.params.id), eq(hints.player_id, parsed.data.player_id)));
    return { hints: rows, remaining: Math.max(0, MAX_HINTS - rows.length) };
  });
}
