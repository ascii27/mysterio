import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // TODO M1.4: replace db:true stub with a real probe once DB client is available
  app.get("/health", async () => ({ ok: true, db: true }));
}
