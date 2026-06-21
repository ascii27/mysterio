import type { FastifyInstance } from "fastify";
import { worldImageVersion } from "../services/images/storage.js";

export async function townMapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/town-map", async () => {
    const v = await worldImageVersion("town-map.png");
    return { url: v === null ? null : `/images/world/town-map.png?v=${v}` };
  });
}
