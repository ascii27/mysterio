import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// mysteriesRoutes imports the orchestrator + tts agent at module load; stub them so registering is cheap and offline.
vi.mock("../services/generation/orchestrator.js", () => ({ runGeneration: vi.fn() }));
vi.mock("../services/generation/agents/ttsAgent.js", () => ({ runTtsAgent: vi.fn() }));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players, mysteries, solutions, clues } from "../db/schema.js";
import { mysteriesRoutes } from "./mysteries.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  for (const id of ["p-a", "p-b"]) {
    await db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" });
  }
  await db.insert(mysteries).values({ id: "m-ready", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "ready", target_age_range: "12-13" });
  await db.insert(mysteries).values({ id: "m-pending", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "pending" });
  app = Fastify();
  await app.register(mysteriesRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

const list = async (pid: string) =>
  (await app.inject({ method: "GET", url: `/mysteries?player_id=${pid}` })).json().mysteries as Array<{ id: string; solved: boolean; started: boolean }>;

describe("GET /mysteries — shared pool + per-detective status", () => {
  it("shows ready stories to everyone and non-ready only to the creator", async () => {
    const b = await list("p-b");
    expect(b.map((m) => m.id)).toContain("m-ready");
    expect(b.map((m) => m.id)).not.toContain("m-pending");
    const a = await list("p-a");
    expect(a.map((m) => m.id)).toContain("m-pending");
    expect(a.map((m) => m.id)).toContain("m-ready");
  });

  it("solved status is per-detective", async () => {
    const db = getDb();
    await db.insert(solutions).values({
      id: "sol-a", mystery_id: "m-ready", player_id: "p-a",
      is_correct: true, hints_used: 0, gave_up: false,
    });
    const a = (await list("p-a")).find((m) => m.id === "m-ready")!;
    const b = (await list("p-b")).find((m) => m.id === "m-ready")!;
    expect(a.solved).toBe(true);
    expect(a.started).toBe(true);
    expect(b.solved).toBe(false);
    expect(b.started).toBe(false);
  });

  it("returns target_age_range for the badge", async () => {
    const a = await list("p-a");
    const ready = a.find((m) => m.id === "m-ready") as unknown as { target_age_range: string | null };
    expect(ready.target_age_range).toBe("12-13");
  });

  it("does not duplicate a mystery when the player has multiple clues on it", async () => {
    // Regression: clues has no uniqueness on (mystery_id, player_id) for manual clues,
    // so a non-DISTINCT LEFT JOIN fans out — one mystery would appear N times for N clues.
    const db = getDb();
    await db.insert(clues).values({
      id: "c-1", mystery_id: "m-ready", player_id: "p-a",
      category_type: "note", content: "first note", source: "manual",
    });
    await db.insert(clues).values({
      id: "c-2", mystery_id: "m-ready", player_id: "p-a",
      category_type: "note", content: "second note", source: "manual",
    });
    const a = await list("p-a");
    expect(a.filter((m) => m.id === "m-ready").length).toBe(1);
    expect(a.find((m) => m.id === "m-ready")!.started).toBe(true);
  });
});
