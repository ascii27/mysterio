import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players, mysteries } from "../db/schema.js";
import { cluesRoutes } from "./clues.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  for (const id of ["p-a", "p-b"]) {
    await db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" });
  }
  await db.insert(mysteries).values({ id: "m-1", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "ready" });
  app = Fastify();
  await app.register(cluesRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("clue routes — per-detective scoping", () => {
  it("scopes clues per detective", async () => {
    const a = await app.inject({ method: "POST", url: "/mysteries/m-1/clues",
      payload: { player_id: "p-a", category_type: "note", content: "A's note" } });
    expect(a.statusCode).toBe(201);
    const bList = await app.inject({ method: "GET", url: "/mysteries/m-1/clues?player_id=p-b" });
    expect(bList.json().clues).toHaveLength(0);
    const aList = await app.inject({ method: "GET", url: "/mysteries/m-1/clues?player_id=p-a" });
    expect(aList.json().clues).toHaveLength(1);
  });

  it("dedupes annotation clues per detective; both detectives can add the same annotation", async () => {
    const mk = (player_id: string) => app.inject({ method: "POST", url: "/mysteries/m-1/clues",
      payload: { player_id, category_type: "character", content: "Oliver", source: "annotation", annotation_id: "p-oliver" } });
    expect((await mk("p-a")).statusCode).toBe(201);
    expect((await mk("p-a")).statusCode).toBe(200); // same detective re-tap → existing row
    expect((await mk("p-b")).statusCode).toBe(201); // other detective → independent row
  });

  it("requires player_id on GET", async () => {
    const res = await app.inject({ method: "GET", url: "/mysteries/m-1/clues" });
    expect(res.statusCode).toBe(400);
  });
});
