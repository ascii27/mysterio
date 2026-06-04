import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// mysteriesRoutes imports the orchestrator + tts agent at module load; stub them so registering is cheap and offline.
vi.mock("../services/generation/orchestrator.js", () => ({ runGeneration: vi.fn() }));
vi.mock("../services/generation/agents/ttsAgent.js", () => ({ runTtsAgent: vi.fn() }));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players, mysteries, solutions } from "../db/schema.js";
import { mysteriesRoutes } from "./mysteries.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  for (const id of ["p-a", "p-b"]) {
    db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" }).run();
  }
  db.insert(mysteries).values({ id: "m-ready", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "ready" }).run();
  db.insert(mysteries).values({ id: "m-pending", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "pending" }).run();
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
    db.insert(solutions).values({
      id: "sol-a", mystery_id: "m-ready", player_id: "p-a",
      is_correct: 1, hints_used: 0, gave_up: 0,
    }).run();
    const a = (await list("p-a")).find((m) => m.id === "m-ready")!;
    const b = (await list("p-b")).find((m) => m.id === "m-ready")!;
    expect(a.solved).toBe(true);
    expect(a.started).toBe(true);
    expect(b.solved).toBe(false);
  });
});
