import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import type { LogicStructure } from "@mysterio/shared";
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

const LOGIC = {
  characters: [
    { id: "ms-green", name: "Ms. Green" },
    { id: "mr-blue", name: "Mr. Blue" },
  ],
  true_solution: { who_did_it: "ms-green", how: "She used the spare key.", why: "To borrow it." },
} as unknown as LogicStructure;

async function seedSolved(playerId: string, mysteryId: string, opts: { is_correct: boolean; status?: string; title?: string }) {
  const db = getDb();
  await db.insert(players).values({ id: playerId, name: playerId, age_range: "10-11", default_difficulty: "easy" }).onConflictDoNothing();
  await db.insert(mysteries).values({
    id: mysteryId, player_id: playerId, category: "missing-pet", difficulty: "medium",
    status: opts.status ?? "ready", title: opts.title ?? "The Case", cover_image_path: "covers/x.png",
    logic_structure_json: LOGIC,
  }).onConflictDoNothing();
  await db.insert(solutions).values({ id: `s-${mysteryId}`, mystery_id: mysteryId, player_id: playerId, is_correct: opts.is_correct });
}

describe("GET /players/:id/trophies", () => {
  it("lists solved cases with resolved culprit name + how", async () => {
    await seedSolved("p1", "m1", { is_correct: true, title: "The Borrowed Tortoise" });
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
    await seedSolved("p1", "m-wrong", { is_correct: false });
    await seedSolved("p1", "m-pending", { is_correct: true, status: "pending" });
    const res = await app.inject({ method: "GET", url: "/players/p1/trophies" });
    expect(res.json().trophies).toHaveLength(0);
  });

  it("returns an empty list for a detective with no solves", async () => {
    await getDb().insert(players).values({ id: "p2", name: "p2", age_range: "8-9", default_difficulty: "easy" });
    const res = await app.inject({ method: "GET", url: "/players/p2/trophies" });
    expect(res.statusCode).toBe(200);
    expect(res.json().trophies).toEqual([]);
  });

  it("returns a trophy with null culprit/how when logic_structure_json is null", async () => {
    const db = getDb();
    await db.insert(players).values({ id: "p3", name: "p3", age_range: "10-11", default_difficulty: "easy" }).onConflictDoNothing();
    await db.insert(mysteries).values({
      id: "m-bad", player_id: "p3", category: "missing-pet", difficulty: "easy",
      status: "ready", title: "Bad Logic", cover_image_path: "covers/x.png",
      logic_structure_json: null,
    });
    await db.insert(solutions).values({ id: "s-m-bad", mystery_id: "m-bad", player_id: "p3", is_correct: true });
    const res = await app.inject({ method: "GET", url: "/players/p3/trophies" });
    expect(res.statusCode).toBe(200);
    const trophies = res.json().trophies;
    expect(trophies).toHaveLength(1);
    expect(trophies[0].culprit_name).toBeNull();
    expect(trophies[0].how).toBeNull();
  });
});
