import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  getDb().insert(players).values({ id: "p1", name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" }).run();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("PATCH /players/:id", () => {
  it("updates a subset of fields and returns the player", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: { name: "Lily B", age_range: "12-13" } });
    expect(res.statusCode).toBe(200);
    const p = res.json().player;
    expect(p.name).toBe("Lily B");
    expect(p.age_range).toBe("12-13");
    expect(p.default_difficulty).toBe("easy"); // untouched
    expect(p.avatar_description).toBe("red hair"); // untouched
  });

  it("trims name and treats empty avatar_description as null", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: { name: "  Sam  ", avatar_description: "" } });
    expect(res.json().player.name).toBe("Sam");
    expect(res.json().player.avatar_description).toBeNull();
  });

  it("no-op empty patch returns the player unchanged", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().player.name).toBe("Lily");
  });

  it("updates avatar_description to a new non-empty value", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: { avatar_description: "a kid in a blue cape" } });
    expect(res.json().player.avatar_description).toBe("a kid in a blue cape");
  });

  it("404s on unknown id and 400s on a bad field", async () => {
    expect((await app.inject({ method: "PATCH", url: "/players/nope", payload: { name: "X" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/players/p1", payload: { age_range: "99-100" } })).statusCode).toBe(400);
  });
});
