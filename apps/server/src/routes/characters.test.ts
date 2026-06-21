import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { characters, caseAppearances, mysteries, solutions } from "../db/schema.js";
import { charactersRoutes } from "./characters.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  await db.insert(characters).values([
    { id: "rosa-pine", name: "Rosa Pine", description: "Diner owner.", is_seed: true },
    { id: "finn", name: "Finn", description: "A newcomer.", is_seed: false },
  ]);
  await db.insert(mysteries).values([
    { id: "solved-case", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Solved One" },
    { id: "open-case", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Open One" },
  ]);
  await db.insert(caseAppearances).values([
    { id: "a1", mystery_id: "solved-case", character_id: "finn", role_in_case: "suspect", is_culprit: true, motive: "greed" },
    { id: "a2", mystery_id: "open-case", character_id: "finn", role_in_case: "suspect", is_culprit: true, motive: "revenge" },
    { id: "a3", mystery_id: "solved-case", character_id: "rosa-pine", role_in_case: "witness", is_culprit: false, motive: null },
  ]);
  // player "p1" solved solved-case, has NOT resolved open-case
  await db.insert(solutions).values({
    id: "s1", mystery_id: "solved-case", player_id: "p1", is_correct: true,
  } as never);
  app = Fastify();
  await app.register(charactersRoutes, { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("GET /api/characters", () => {
  it("lists roster characters with a spoiler-safe appearance_count", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters" });
    expect(res.statusCode).toBe(200);
    const list = res.json().characters as Array<{ id: string; appearance_count: number }>;
    const finn = list.find((c) => c.id === "finn")!;
    expect(finn.appearance_count).toBe(2);
    const rosa = list.find((c) => c.id === "rosa-pine")!;
    expect(rosa.appearance_count).toBe(1);
    // no is_culprit leakage on the list
    expect(JSON.stringify(list)).not.toContain("is_culprit");
  });
});

describe("GET /api/characters/:id (spoiler redaction)", () => {
  it("reveals is_culprit/motive only for cases the player has resolved", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters/finn?player_id=p1" });
    expect(res.statusCode).toBe(200);
    const detail = res.json().character as { appearances: Array<{ mystery_id: string; is_culprit?: boolean; motive?: string | null }> };
    const solved = detail.appearances.find((a) => a.mystery_id === "solved-case")!;
    const open = detail.appearances.find((a) => a.mystery_id === "open-case")!;
    expect(solved.is_culprit).toBe(true);
    expect(solved.motive).toBe("greed");
    expect("is_culprit" in open).toBe(false); // redacted — player hasn't resolved this case
    expect("motive" in open).toBe(false);
  });

  it("404s an unknown character", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters/nope?player_id=p1" });
    expect(res.statusCode).toBe(404);
  });

  it("hides is_culprit on a case the player guessed WRONG but is still solving", async () => {
    // p1 submitted a wrong guess on open-case (is_correct=false, gave_up=false) — still trying, must NOT see the answer.
    await getDb().insert(solutions).values({ id: "s-wrong", mystery_id: "open-case", player_id: "p1", is_correct: false, gave_up: false } as never);
    const res = await app.inject({ method: "GET", url: "/api/characters/finn?player_id=p1" });
    const detail = res.json().character as { appearances: Array<{ mystery_id: string; is_culprit?: boolean; motive?: string | null }> };
    const open = detail.appearances.find((a) => a.mystery_id === "open-case")!;
    expect("is_culprit" in open).toBe(false);
    expect("motive" in open).toBe(false);
  });

  it("reveals is_culprit on a case the player GAVE UP on", async () => {
    await getDb().insert(solutions).values({ id: "s-gaveup", mystery_id: "open-case", player_id: "p2", is_correct: false, gave_up: true } as never);
    const res = await app.inject({ method: "GET", url: "/api/characters/finn?player_id=p2" });
    const detail = res.json().character as { appearances: Array<{ mystery_id: string; is_culprit?: boolean; motive?: string | null }> };
    const open = detail.appearances.find((a) => a.mystery_id === "open-case")!;
    expect(open.is_culprit).toBe(true);
    expect(open.motive).toBe("revenge");
    // p2 has no solution on solved-case → still hidden
    const solved = detail.appearances.find((a) => a.mystery_id === "solved-case")!;
    expect("is_culprit" in solved).toBe(false);
  });

  it("400s when player_id is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters/finn" });
    expect(res.statusCode).toBe(400);
  });
});
