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

  it("deleting a detective cascades their progress but leaves shared stories + other detectives' progress", async () => {
    const db = getDb();
    for (const id of ["d-a", "d-b"]) {
      db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" }).run();
    }
    db.insert(mysteries).values({ id: "m1", player_id: "d-a", category: "missing-pet", difficulty: "easy", status: "ready" }).run();
    db.insert(clues).values({ id: "ca", mystery_id: "m1", player_id: "d-a", category_type: "note", content: "a" }).run();
    db.insert(clues).values({ id: "cb", mystery_id: "m1", player_id: "d-b", category_type: "note", content: "b" }).run();
    db.insert(solutions).values({ id: "sa", mystery_id: "m1", player_id: "d-a", is_correct: 0 }).run();
    db.insert(hints).values({ id: "ha", mystery_id: "m1", player_id: "d-a", content: "h" }).run();

    const del = await app.inject({ method: "DELETE", url: "/players/d-a" });
    expect(del.statusCode).toBe(204);

    // d-a's progress cascade-deleted
    expect(db.select().from(clues).where(eq(clues.player_id, "d-a")).all()).toHaveLength(0);
    expect(db.select().from(solutions).where(eq(solutions.player_id, "d-a")).all()).toHaveLength(0);
    expect(db.select().from(hints).where(eq(hints.player_id, "d-a")).all()).toHaveLength(0);
    // shared mystery survives; creator nulled (ON DELETE SET NULL)
    const m = db.select().from(mysteries).where(eq(mysteries.id, "m1")).get();
    expect(m).toBeTruthy();
    expect(m?.player_id).toBeNull();
    // d-b's progress untouched
    expect(db.select().from(clues).where(eq(clues.player_id, "d-b")).all()).toHaveLength(1);
  });
});
