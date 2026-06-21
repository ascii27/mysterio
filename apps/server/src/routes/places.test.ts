import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../services/images/placeImageAgent.js", () => ({ runPlaceImageAgent: vi.fn() }));

import * as placeAgent from "../services/images/placeImageAgent.js";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { places, mysteries, solutions } from "../db/schema.js";
import { placesRoutes } from "./places.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  await db.insert(places).values({ id: "maple-diner", name: "The Maple Diner", description: "A diner.", is_seed: true });
  await db.insert(mysteries).values([
    { id: "m-solved", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Solved One", place_id: "maple-diner" },
    { id: "m-open", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Open One", place_id: "maple-diner" },
  ]);
  await db.insert(solutions).values({ id: "s1", mystery_id: "m-solved", player_id: "p1", is_correct: true } as never);
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

describe("GET /api/places/:id", () => {
  it("returns place detail with its cases + the player's solved flag (spoiler-safe: no solution data)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/places/maple-diner?player_id=p1" });
    expect(res.statusCode).toBe(200);
    const place = res.json().place as { id: string; cases: Array<{ mystery_id: string; title: string; solved: boolean }> };
    expect(place.id).toBe("maple-diner");
    expect(place.cases).toHaveLength(2);
    expect(place.cases.find((c) => c.mystery_id === "m-solved")!.solved).toBe(true);
    expect(place.cases.find((c) => c.mystery_id === "m-open")!.solved).toBe(false);
    expect(JSON.stringify(place)).not.toContain("is_culprit");
    expect(JSON.stringify(place)).not.toContain("who_did_it");
  });

  it("400s without player_id and 404s an unknown place", async () => {
    expect((await app.inject({ method: "GET", url: "/api/places/maple-diner" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/places/nope?player_id=p1" })).statusCode).toBe(404);
  });
});

describe("POST /api/places/:id/image", () => {
  it("regenerates a place image, stores it, returns the place", async () => {
    vi.spyOn(placeAgent, "runPlaceImageAgent").mockResolvedValue({ ok: true, imagePath: "places/maple-diner-abc.png" });
    const res = await app.inject({ method: "POST", url: "/api/places/maple-diner/image" });
    expect(res.statusCode).toBe(200);
    expect(res.json().place.image_path).toBe("places/maple-diner-abc.png");
    vi.restoreAllMocks();
  });

  it("404s an unknown place", async () => {
    const res = await app.inject({ method: "POST", url: "/api/places/nope/image" });
    expect(res.statusCode).toBe(404);
  });

  it("502s when generation fails", async () => {
    vi.spyOn(placeAgent, "runPlaceImageAgent").mockResolvedValue({ ok: false, error: "boom" });
    const res = await app.inject({ method: "POST", url: "/api/places/maple-diner/image" });
    expect(res.statusCode).toBe(502);
    vi.restoreAllMocks();
  });
});
