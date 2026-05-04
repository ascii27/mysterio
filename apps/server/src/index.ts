import Fastify from "fastify";
import { loadEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });

  await app.register(healthRoutes, { prefix: "/api" });

  app.setErrorHandler((err: Error, _req, reply) => {
    logger.error("request_error", { err: err.message, stack: err.stack });
    reply.status(500).send({ error: "internal_server_error" });
  });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info("server_started", { port: env.PORT });
}

main().catch((err) => {
  logger.error("fatal", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
