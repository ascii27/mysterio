import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { mysteries, players, solutions } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

const LOGIC = JSON.stringify({
  characters: [
    { id: "ms-green", name: "Ms. Green" },
    { id: "mr-blue", name: "Mr. Blue" },
  ],
  true_solution: { who_did_it: "ms-green", how: "She used the spare key.", why: "To borrow it." },
});

function seedSolved(playerId: string, mysteryId: string, opts: { is_correct: number; status?: string; title?: string }) {
  const db = getDb();
  db.insert(players).values({ id: playerId, name: playerId, age_range: "10-11", default_difficulty: "easy" }).onConflictDoNothing().run();
  db.insert(mysteries).values({
    id: mysteryId, player_id: playerId, category: "missing-pet", difficulty: "medium",
    status: opts.status ?? "ready", title: opts.title ?? "The Case", cover_image_path: "covers/x.png",
    logic_structure_json: LOGIC,
  }).run();
  db.insert(solutions).values({ id: `s-${mysteryId}`, mystery_id: mysteryId, player_id: playerId, is_correct: opts.is_correct }).run();
}

describe("GET /players/:id/trophies", () => {
  it("lists solved cases with resolved culprit name + how", async () => {
    seedSolved("p1", "m1", { is_correct: 1, title: "The Borrowed Tortoise" });
    const res = await app.inject({ method: "GET", url: "/players/p1/trophies" });
    expect(res.statusCode).toBe(200);
    const trophies = res.json().trophies;
    expect(trophies).toHaveLength(1);
    expect(trophies[0]).toMatchObject({
      mystery_id: "m1",
      title: "The Borrowed Tortoise",
      difficulty: "medium",
      cover_image_path: "covers/x.png",
      culprit_name: "Ms. Green",
      how: "She used the spare key.",
    });
  });

  it("excludes wrong guesses and non-ready mysteries", async () => {
    seedSolved("p1", "m-wrong", { is_correct: 0 });
    seedSolved("p1", "m-pending", { is_correct: 1, status: "pending" });
    const res = await app.inject({ method: "GET", url: "/players/p1/trophies" });
    expect(res.json().trophies).toHaveLength(0);
  });

  it("returns an empty list for a detective with no solves", async () => {
    getDb().insert(players).values({ id: "p2", name: "p2", age_range: "8-9", default_difficulty: "easy" }).run();
    const res = await app.inject({ method: "GET", url: "/players/p2/trophies" });
    expect(res.statusCode).toBe(200);
    expect(res.json().trophies).toEqual([]);
  });
});
