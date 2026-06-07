import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../services/generation/agents/explanationAgent.js", () => ({
  runExplanation: async () => "because reasons",
}));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import type { LogicStructure } from "@mysterio/shared";
import { players, mysteries } from "../db/schema.js";
import { solutionsRoutes } from "./solutions.js";

const LS_FIXTURE = {
  category: "missing-pet",
  setting: "A sunny backyard with a rabbit hutch.",
  central_question: "Who took Rosie and how did they get past the gate?",
  characters: [
    { id: "you", name: "You", role: "detective", description: "The detective on the case.", is_culprit: false, motive: null },
    { id: "theo", name: "Theo", role: "suspect", description: "Lives past the back fence.", is_culprit: true, motive: "Wanted a pet." },
    { id: "priya", name: "Priya", role: "suspect", description: "The neighbor's kid.", is_culprit: false, motive: null },
  ],
  essential_clues: [
    { id: "clover-trail", description: "A trail of clover leads to a gap in the fence.", category_type: "event" },
    { id: "open-latch", description: "The hutch latch was lifted, not broken.", category_type: "item" },
  ],
  false_clues: [{ id: "spooked-cat", description: "A cat was on the shed roof." }],
  true_solution: { who_did_it: "theo", how: "He lifted the latch and lured Rosie with clover.", why: "He wanted a pet." },
  how_distractors: ["A fox dug under.", "The latch broke on its own.", "Priya left the door open."],
  why_distractors: ["For a prank.", "To sell her.", "Out of anger."],
  logic_chain: ["Clover trail to fence gap.", "Latch lifted by a person.", "Theo lives past the fence and wanted a pet."],
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
  await app.register(solutionsRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("solution routes — per-detective scoping", () => {
  it("a solve by p-a does not mark the mystery solved for p-b", async () => {
    const t = LS_FIXTURE.true_solution;
    const a = await app.inject({ method: "POST", url: "/mysteries/m-1/submit-solution",
      payload: { player_id: "p-a", guess_who: t.who_did_it, guess_how: t.how, guess_why: t.why } });
    expect(a.statusCode).toBe(201);

    const aSol = await app.inject({ method: "GET", url: "/mysteries/m-1/solution?player_id=p-a" });
    expect(aSol.json().solution).not.toBeNull();

    const bSol = await app.inject({ method: "GET", url: "/mysteries/m-1/solution?player_id=p-b" });
    expect(bSol.json().solution).toBeNull();

    // p-b can still fetch solve-options (not blocked by p-a's solve)
    const bOpts = await app.inject({ method: "GET", url: "/mysteries/m-1/solve-options?player_id=p-b" });
    expect(bOpts.statusCode).toBe(200);
    expect(bOpts.json().how_options).toHaveLength(4);
  });

  it("requires player_id on solution GET", async () => {
    const res = await app.inject({ method: "GET", url: "/mysteries/m-1/solution" });
    expect(res.statusCode).toBe(400);
  });
});
