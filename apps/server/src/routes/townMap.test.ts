import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const { worldImageVersion } = vi.hoisted(() => ({ worldImageVersion: vi.fn() }));
vi.mock("../services/images/storage.js", () => ({ worldImageVersion }));

import { townMapRoutes } from "./townMap.js";

let app: FastifyInstance;
beforeEach(async () => {
  app = Fastify();
  await app.register(townMapRoutes, { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

describe("GET /api/town-map", () => {
  it("returns the map url with the mtime version token when the map exists", async () => {
    worldImageVersion.mockResolvedValue(1717000000000);
    const res = await app.inject({ method: "GET", url: "/api/town-map" });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("/images/world/town-map.png?v=1717000000000");
  });

  it("returns url null when the map does not exist", async () => {
    worldImageVersion.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/api/town-map" });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBeNull();
  });
});
