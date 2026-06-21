import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CharacterListItem, CharacterDetail, CharacterAppearance, RoleInCase } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { characters, caseAppearances, mysteries, solutions } from "../db/schema.js";
import { runCharacterPortraitAgent } from "../services/images/characterPortraitAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";

const detailQuery = z.object({ player_id: z.string().min(1) });

export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  // List — spoiler-safe (count only, no per-case guilt).
  app.get("/characters", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: characters.id, name: characters.name, description: characters.description, portrait_image_path: characters.portrait_image_path })
      .from(characters);
    const appRows = await db.select({ character_id: caseAppearances.character_id }).from(caseAppearances);
    // JS tally instead of SQL COUNT/GROUP BY — avoids pg-mem aggregate limitations.
    const counts = new Map<string, number>();
    for (const a of appRows) counts.set(a.character_id, (counts.get(a.character_id) ?? 0) + 1);
    const list: CharacterListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      portrait_image_path: r.portrait_image_path,
      appearance_count: counts.get(r.id) ?? 0,
    }));
    return { characters: list };
  });

  // Detail — appearances with is_culprit/motive redacted unless the player resolved that case.
  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/characters/:id", async (req, reply) => {
    const parsed = detailQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "player_id is required" });
    }
    const playerId = parsed.data.player_id;
    const db = getDb();

    const charRows = await db
      .select({ id: characters.id, name: characters.name, description: characters.description, portrait_image_path: characters.portrait_image_path })
      .from(characters)
      .where(eq(characters.id, req.params.id));
    if (charRows.length === 0) {
      return reply.code(404).send({ error: "character not found" });
    }
    const c = charRows[0]!;

    // Join appearances → mystery (title) → this player's solution (resolution state).
    const rows = await db
      .select({
        mystery_id: caseAppearances.mystery_id,
        title: mysteries.title,
        role_in_case: caseAppearances.role_in_case,
        is_culprit: caseAppearances.is_culprit,
        motive: caseAppearances.motive,
        resolved: sql<boolean>`(${solutions.id} IS NOT NULL AND (${solutions.is_correct} = true OR ${solutions.gave_up} = true))`,
      })
      .from(caseAppearances)
      .innerJoin(mysteries, eq(mysteries.id, caseAppearances.mystery_id))
      .leftJoin(solutions, and(eq(solutions.mystery_id, caseAppearances.mystery_id), eq(solutions.player_id, playerId)))
      .where(eq(caseAppearances.character_id, req.params.id));

    const appearances: CharacterAppearance[] = rows.map((r) => {
      const base: CharacterAppearance = {
        mystery_id: r.mystery_id,
        title: r.title,
        role_in_case: r.role_in_case as RoleInCase,
      };
      if (r.resolved) {
        base.is_culprit = r.is_culprit;
        base.motive = r.motive;
      }
      return base;
    });

    const detail: CharacterDetail = {
      id: c.id,
      name: c.name,
      description: c.description,
      portrait_image_path: c.portrait_image_path,
      appearances,
    };
    return { character: detail };
  });

  // Regenerate a character's portrait — synchronous, fail-soft, best-effort cleanup of the prior file.
  app.post<{ Params: { id: string } }>("/characters/:id/portrait", async (req, reply) => {
    const db = getDb();
    const [character] = await db.select().from(characters).where(eq(characters.id, req.params.id)).limit(1);
    if (!character) { reply.status(404); return { error: "character_not_found" }; }

    const result = await runCharacterPortraitAgent({ characterId: character.id, description: character.description });
    if (!result.ok) { reply.status(502); return { error: "portrait_generation_failed", detail: result.error }; }

    const previousKey = character.portrait_image_path;
    await db.update(characters).set({ portrait_image_path: result.portraitImagePath }).where(eq(characters.id, character.id));
    if (previousKey && previousKey !== result.portraitImagePath) {
      await deleteImageByKey(previousKey);
    }
    const [row] = await db.select().from(characters).where(eq(characters.id, character.id)).limit(1);
    return { character: row };
  });
}
