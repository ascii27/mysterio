import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock loadEnv to avoid real env vars and the module-level cache problem.
vi.mock("../../config/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({
    MAX_VALIDATION_ATTEMPTS: 3,
    MAX_NARRATIVE_ATTEMPTS: 2,
    MAX_READTHROUGH_ATTEMPTS: 2,
  }),
}));

// Mock all generation collaborators. We'll set up the logicAgent spy after imports.
vi.mock("./agents/logicStructureAgent.js", () => ({
  runLogicStructureAgent: vi.fn(),
}));
vi.mock("./agents/validationAgent.js", () => ({
  runValidationAgent: vi.fn().mockResolvedValue({ ok: true, value: { who: "mabel", how: "x", why: "x", confidence: 0.9 } }),
}));
vi.mock("./compareSolutions.js", () => ({
  compareSolutions: vi.fn().mockResolvedValue({ passed: true, notes: "ok", who_match: true, how_match: true, why_match: true }),
}));
vi.mock("./readthrough.js", () => ({
  writeAndVerifyProse: vi.fn().mockResolvedValue({ ok: true, value: { title: "T", narrative_text: "N", annotations: [] } }),
}));
vi.mock("./agents/coverImageAgent.js", () => ({
  runCoverImageAgent: vi.fn().mockResolvedValue({ ok: false, error: "skip" }),
}));

import { runGeneration } from "./orchestrator.js";
import { runLogicStructureAgent } from "./agents/logicStructureAgent.js";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { mysteries, players, characters } from "../../db/schema.js";

function makeStructure(suspectId: string) {
  return {
    case_type: "test case", setting: "Maple Hollow, the Cozy Cafe, one afternoon.",
    characters: [
      { id: "you", name: "You", role: "detective" as const, description: "You are the detective on this case.", is_culprit: false, motive: null },
      { id: suspectId, name: suspectId, role: "suspect" as const, description: "A described suspect of ten+ chars.", is_culprit: true, motive: "they wanted it" },
    ],
    essential_clues: [], false_clues: [],
    true_solution: { who_did_it: suspectId, how: "x".repeat(10), why: "x".repeat(10) },
    how_distractors: ["a", "b", "c"], why_distractors: ["a", "b", "c"],
    logic_chain: [], central_question: "What happened here today.",
  };
}

beforeEach(() => {
  setupTestDb();
  // Set up the logic agent: returns no-resident on first call, with-resident on second.
  const noResident = makeStructure("stranger");
  const withResident = makeStructure("mabel");
  vi.mocked(runLogicStructureAgent)
    .mockResolvedValueOnce({ ok: true, value: noResident, attemptsUsed: 1 })
    .mockResolvedValueOnce({ ok: true, value: withResident, attemptsUsed: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("orchestrator — ≥1 roster resident gate", () => {
  it("regenerates when the first structure uses no roster resident, then accepts one that does", async () => {
    const db = getDb();
    await db.insert(players).values({ id: "p1", name: "Kid", age_range: "10-11", default_difficulty: "easy" });
    await db.insert(characters).values({ id: "mabel", name: "Mabel", description: "Baker.", traits: null, is_seed: true });
    await db.insert(mysteries).values({ id: "m1", player_id: "p1", category: "mystery", difficulty: "easy", status: "pending", target_age_range: "10-11" });

    await runGeneration({ mysteryId: "m1", difficulty: "easy", ageRange: "10-11", generateImage: false });

    expect(runLogicStructureAgent).toHaveBeenCalledTimes(2);
    // The second call carries a corrective note about missing townsfolk.
    const secondArgs = vi.mocked(runLogicStructureAgent).mock.calls[1]![0];
    expect(secondArgs.previousFailureNotes).toMatch(/Maple Hollow|townsfolk|resident/i);
    const [row] = await db.select().from(mysteries).where(eq(mysteries.id, "m1")).limit(1);
    expect(row?.status).toBe("ready");
    expect(row?.category).toBe("test case"); // case_type copied into the column
  });
});
