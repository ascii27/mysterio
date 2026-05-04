import fastifyStatic from "@fastify/static";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../config/env.js";

export async function staticRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const audioDir = resolve(env.AUDIO_DIR);
  const webDir = resolve("./apps/web/dist");
  mkdirSync(audioDir, { recursive: true });

  await app.register(fastifyStatic, {
    root: audioDir,
    prefix: "/audio/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "365d",
    immutable: true,
  });

  await app.register(fastifyStatic, {
    root: webDir,
    prefix: "/",
    decorateReply: false,
    wildcard: false,
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/audio/")) {
      reply.status(404);
      return { error: "not_found" };
    }
    return reply.sendFile("index.html", webDir);
  });
}
