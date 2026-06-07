import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { clues, hints, mysteries, players, solutions } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();              // fresh in-memory DB with migrations applied
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("players routes", () => {
  it("creates a detective with valid fields and lists it", async () => {
    const res = await app.inject({
      method: "POST", url: "/players",
      payload: { name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().player;
    expect(created.name).toBe("Lily");
    expect(created.age_range).toBe("10-11");
    expect(created.avatar_description).toBe("red hair");
    const list = await app.inject({ method: "GET", url: "/players" });
    expect(list.json().players.some((p: { id: string }) => p.id === created.id)).toBe(true);
  });

  it("trims the name and treats empty avatar_description as null", async () => {
    const res = await app.inject({
      method: "POST", url: "/players",
      payload: { name: "  Sam  ", age_range: "8-9", default_difficulty: "medium", avatar_description: "" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().player.name).toBe("Sam");
    expect(res.json().player.avatar_description).toBeNull();
  });

  it("rejects a bad age_range, empty name, and bad difficulty", async () => {
    for (const payload of [
      { name: "X", age_range: "99-100", default_difficulty: "easy" },
      { name: "   ", age_range: "8-9", default_difficulty: "easy" },
      { name: "X", age_range: "8-9", default_difficulty: "impossible" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/players", payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it("deletes a detective", async () => {
    const created = (await app.inject({
      method: "POST", url: "/players",
      payload: { name: "Gone", age_range: "12-13", default_difficulty: "hard" },
    })).json().player;
    const del = await app.inject({ method: "DELETE", url: `/players/${created.id}` });
    expect(del.statusCode).toBe(204);
    const list = await app.inject({ method: "GET", url: "/players" });
    expect(list.json().players.some((p: { id: string }) => p.id === created.id)).toBe(false);
  });

  it("deleting a detective returns 204 (FK cascade verified in real-PG smoke, Task 11)", async () => {
    // pg-mem skips FK constraints (ON DELETE CASCADE / SET NULL), so cascade
    // assertions cannot run here. The route-level behaviour (204 + player gone
    // from the list) is validated in the "deletes a detective" test above.
    // Full cascade fidelity is covered by the docker-PG smoke in Task 11.
    const db = getDb();
    for (const id of ["d-a", "d-b"]) {
      await db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" });
    }
    await db.insert(mysteries).values({ id: "m1", player_id: "d-a", category: "missing-pet", difficulty: "easy", status: "ready" });
    await db.insert(clues).values({ id: "ca", mystery_id: "m1", player_id: "d-a", category_type: "note", content: "a" });
    await db.insert(clues).values({ id: "cb", mystery_id: "m1", player_id: "d-b", category_type: "note", content: "b" });
    await db.insert(solutions).values({ id: "sa", mystery_id: "m1", player_id: "d-a", is_correct: false });
    await db.insert(hints).values({ id: "ha", mystery_id: "m1", player_id: "d-a", content: "h" });

    const del = await app.inject({ method: "DELETE", url: "/players/d-a" });
    expect(del.statusCode).toBe(204);

    // Verify the player row itself is gone
    const list = await app.inject({ method: "GET", url: "/players" });
    expect(list.json().players.some((p: { id: string }) => p.id === "d-a")).toBe(false);
    // d-b is unaffected
    expect(list.json().players.some((p: { id: string }) => p.id === "d-b")).toBe(true);
  });
});
