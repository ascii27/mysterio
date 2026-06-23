import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../services/generation/agents/hintAgent.js", () => ({
  runHintAgent: async () => "a hint",
}));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import type { LogicStructure } from "@mysterio/shared";
import { players, mysteries } from "../db/schema.js";
import { hintsRoutes } from "./hints.js";

const LS_FIXTURE = {
  case_type: "missing-pet", setting: "A backyard.", central_question: "Who took Rosie?",
  characters: [
    { id: "you", name: "You", role: "detective", description: "The detective.", is_culprit: false, motive: null },
    { id: "theo", name: "Theo", role: "suspect", description: "Lives past the fence.", is_culprit: true, motive: "Wanted a pet." },
  ],
  essential_clues: [
    { id: "clover-trail", description: "Clover leads to a fence gap.", category_type: "event" },
    { id: "open-latch", description: "The latch was lifted.", category_type: "item" },
  ],
  false_clues: [{ id: "cat", description: "A cat on the roof." }],
  true_solution: { who_did_it: "theo", how: "Lifted the latch.", why: "Wanted a pet." },
  how_distractors: ["A fox.", "It broke.", "Left open."],
  why_distractors: ["Prank.", "To sell.", "Anger."],
  logic_chain: ["Clover to gap.", "Latch lifted.", "Theo did it."],
} as LogicStructure;

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  for (const id of ["p-a", "p-b"]) {
    await db.insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" });
  }
  await db.insert(mysteries).values({
    id: "m-1", player_id: "p-a", category: "missing-pet", difficulty: "easy",
    status: "ready", logic_structure_json: LS_FIXTURE,
  });
  app = Fastify();
  await app.register(hintsRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("hint routes — per-detective scoping", () => {
  it("scopes hints per detective and enforces the limit per detective", async () => {
    const ask = (player_id: string) => app.inject({ method: "POST", url: "/mysteries/m-1/hints", payload: { player_id } });
    expect((await ask("p-a")).statusCode).toBe(201);
    expect((await ask("p-a")).statusCode).toBe(201);
    expect((await ask("p-a")).statusCode).toBe(409); // limit (2) reached for p-a

    expect((await ask("p-b")).statusCode).toBe(201); // p-b has their own budget
    const bList = await app.inject({ method: "GET", url: "/mysteries/m-1/hints?player_id=p-b" });
    expect(bList.json().hints).toHaveLength(1);
    expect(bList.json().remaining).toBe(1);
  });

  it("requires player_id on GET", async () => {
    const res = await app.inject({ method: "GET", url: "/mysteries/m-1/hints" });
    expect(res.statusCode).toBe(400);
  });
});
