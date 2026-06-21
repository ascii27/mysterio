import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { places } from "../db/schema.js";
import { placesRoutes } from "./places.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  await getDb().insert(places).values({ id: "maple-diner", name: "The Maple Diner", description: "A diner.", is_seed: true });
  app = Fastify();
  await app.register(placesRoutes, { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("GET /api/places", () => {
  it("lists places", async () => {
    const res = await app.inject({ method: "GET", url: "/api/places" });
    expect(res.statusCode).toBe(200);
    const list = res.json().places as Array<{ id: string; name: string }>;
    expect(list.find((p) => p.id === "maple-diner")?.name).toBe("The Maple Diner");
  });
});
