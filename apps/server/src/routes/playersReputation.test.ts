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

async function seedPlayer(id: string) {
  await getDb().insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" });
}
async function seedSolvedCase(playerId: string, mysteryId: string, difficulty: "easy" | "medium" | "hard", outcome: { is_correct: boolean; gave_up?: boolean }) {
  const db = getDb();
  await db.insert(mysteries).values({ id: mysteryId, player_id: playerId, category: "missing-pet", difficulty, status: "ready" });
  await db.insert(solutions).values({ id: `s-${mysteryId}-${playerId}`, mystery_id: mysteryId, player_id: playerId, is_correct: outcome.is_correct, gave_up: outcome.gave_up ?? false });
}

describe("GET /players reputation", () => {
  it("a detective with no solves is Rookie with 0 points", async () => {
    await seedPlayer("p1");
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(0);
    expect(p.reputation.rank_name).toBe("Rookie");
    expect(p.reputation.solved_count).toBe(0);
  });

  it("sums difficulty-weighted points over correct solves only", async () => {
    await seedPlayer("p1");
    await seedSolvedCase("p1", "m-easy", "easy", { is_correct: true });   // +1
    await seedSolvedCase("p1", "m-hard", "hard", { is_correct: true });   // +3
    await seedSolvedCase("p1", "m-wrong", "hard", { is_correct: false });  // wrong → 0
    await seedSolvedCase("p1", "m-gaveup", "medium", { is_correct: false, gave_up: true }); // give-up → 0
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(4); // 1 + 3
    expect(p.reputation.rank_name).toBe("Junior Sleuth"); // >= 3
    expect(p.reputation.solved_count).toBe(2);
  });

  it("scopes reputation per detective", async () => {
    await seedPlayer("p1"); await seedPlayer("p2");
    await seedSolvedCase("p1", "ma", "hard", { is_correct: true });
    await seedSolvedCase("p2", "mb", "easy", { is_correct: true });
    const list = await app.inject({ method: "GET", url: "/players" });
    const byId = Object.fromEntries(
      list.json().players.map((x: { id: string; reputation: { points: number; solved_count: number } }) => [x.id, x.reputation]),
    );
    expect(byId.p1.points).toBe(3);
    expect(byId.p2.points).toBe(1);
    expect(byId.p1.solved_count).toBe(1);
    expect(byId.p2.solved_count).toBe(1);
  });
});
