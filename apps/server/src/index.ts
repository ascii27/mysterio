import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { loadEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    logger.error("request_error", { err: err.message, stack: err.stack, status });
    reply.status(status).send({ error: "internal_server_error" });
  });

  await app.register(healthRoutes, { prefix: "/api" });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info("server_started", { port: env.PORT });
}

main().catch((err) => {
  logger.error("fatal", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
