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

function seedPlayer(id: string) {
  getDb().insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" }).run();
}
function seedSolvedCase(playerId: string, mysteryId: string, difficulty: "easy" | "medium" | "hard", outcome: { is_correct: number; gave_up?: number }) {
  const db = getDb();
  db.insert(mysteries).values({ id: mysteryId, player_id: playerId, category: "missing-pet", difficulty, status: "ready" }).run();
  db.insert(solutions).values({ id: `s-${mysteryId}-${playerId}`, mystery_id: mysteryId, player_id: playerId, is_correct: outcome.is_correct, gave_up: outcome.gave_up ?? 0 }).run();
}

describe("GET /players reputation", () => {
  it("a detective with no solves is Rookie with 0 points", async () => {
    seedPlayer("p1");
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(0);
    expect(p.reputation.rank_name).toBe("Rookie");
    expect(p.reputation.solved_count).toBe(0);
  });

  it("sums difficulty-weighted points over correct solves only", async () => {
    seedPlayer("p1");
    seedSolvedCase("p1", "m-easy", "easy", { is_correct: 1 });   // +1
    seedSolvedCase("p1", "m-hard", "hard", { is_correct: 1 });   // +3
    seedSolvedCase("p1", "m-wrong", "hard", { is_correct: 0 });  // wrong → 0
    seedSolvedCase("p1", "m-gaveup", "medium", { is_correct: 0, gave_up: 1 }); // give-up → 0
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(4); // 1 + 3
    expect(p.reputation.rank_name).toBe("Junior Sleuth"); // >= 3
    expect(p.reputation.solved_count).toBe(2);
  });

  it("scopes reputation per detective", async () => {
    seedPlayer("p1"); seedPlayer("p2");
    seedSolvedCase("p1", "ma", "hard", { is_correct: 1 });
    seedSolvedCase("p2", "mb", "easy", { is_correct: 1 });
    const list = await app.inject({ method: "GET", url: "/players" });
    const map = Object.fromEntries(list.json().players.map((x: { id: string; reputation: { points: number } }) => [x.id, x.reputation.points]));
    expect(map.p1).toBe(3);
    expect(map.p2).toBe(1);
  });
});
