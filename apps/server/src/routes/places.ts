import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";
import { places } from "../db/schema.js";

export async function placesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/places", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places);
    return { places: rows };
  });
}
