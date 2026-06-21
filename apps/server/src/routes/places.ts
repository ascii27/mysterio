import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { PlaceDetail, PlaceCase } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { places, mysteries, solutions } from "../db/schema.js";
import { runPlaceImageAgent } from "../services/images/placeImageAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";

const detailQuery = z.object({ player_id: z.string().min(1) });

export async function placesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/places", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places);
    return { places: rows };
  });

  // Place detail — cases set here, spoiler-safe (title + the player's solved flag only).
  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/places/:id", async (req, reply) => {
    const parsed = detailQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "player_id is required" });
    const playerId = parsed.data.player_id;
    const db = getDb();

    const [place] = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places)
      .where(eq(places.id, req.params.id));
    if (!place) return reply.code(404).send({ error: "place not found" });

    const rows = await db
      .select({
        mystery_id: mysteries.id,
        title: mysteries.title,
        solved: sql<boolean>`(${solutions.id} IS NOT NULL AND ${solutions.is_correct} = true)`,
      })
      .from(mysteries)
      .leftJoin(solutions, and(eq(solutions.mystery_id, mysteries.id), eq(solutions.player_id, playerId)))
      .where(eq(mysteries.place_id, req.params.id));

    const cases: PlaceCase[] = rows.map((r) => ({ mystery_id: r.mystery_id, title: r.title, solved: r.solved }));
    const detail: PlaceDetail = { id: place.id, name: place.name, description: place.description, image_path: place.image_path, cases };
    return { place: detail };
  });

  // Regenerate a place image — synchronous, fail-soft, best-effort cleanup of the prior file.
  app.post<{ Params: { id: string } }>("/places/:id/image", async (req, reply) => {
    const db = getDb();
    const [place] = await db.select().from(places).where(eq(places.id, req.params.id)).limit(1);
    if (!place) { reply.status(404); return { error: "place_not_found" }; }

    const result = await runPlaceImageAgent({ placeId: place.id, name: place.name, description: place.description });
    if (!result.ok) { reply.status(502); return { error: "place_image_generation_failed", detail: result.error }; }

    const previousKey = place.image_path;
    await db.update(places).set({ image_path: result.imagePath }).where(eq(places.id, place.id));
    if (previousKey && previousKey !== result.imagePath) {
      await deleteImageByKey(previousKey);
    }
    const [row] = await db.select().from(places).where(eq(places.id, place.id)).limit(1);
    return { place: row };
  });
}
