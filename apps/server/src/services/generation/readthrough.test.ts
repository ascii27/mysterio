import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { runReadthroughGate } from "./readthrough.js";
import { writeAndVerifyProse } from "./readthrough.js";

const logic = {
  case_type: "missing-pet",
  setting: "A quiet cul-de-sac with rabbit hutches.",
  characters: [
    { id: "maya", name: "Maya", role: "suspect", description: "The new kid next door who loves animals.", is_culprit: true, motive: "wanted to help the sick rabbit" },
    { id: "theo", name: "Theo", role: "suspect", description: "Owns the rabbit.", is_culprit: false, motive: null },
    { id: "officer-pat", name: "Officer Pat", role: "detective", description: "Neighborhood helper.", is_culprit: false, motive: null },
  ],
  essential_clues: [
    { id: "carrot", description: "A half-eaten carrot near the hutch.", category_type: "item" },
    { id: "open-latch", description: "The hutch latch was flipped up.", category_type: "item" },
    { id: "maya-note", description: "Maya left a worried note about the rabbit sneezing.", category_type: "note" },
  ],
  false_clues: [{ id: "wrapper", description: "A candy wrapper on the lawn." }],
  true_solution: { who_did_it: "maya", how: "She flipped the latch and carried the rabbit home.", why: "She wanted to nurse the sneezing rabbit back to health." },
  how_distractors: ["It squeezed out a gap", "A fox carried it off", "The gate blew open"],
  why_distractors: ["To sell it", "For a prank", "Out of spite"],
  logic_chain: ["The latch was flipped from outside.", "Maya's note shows she worried about it.", "The carrot lured it to her."],
  central_question: "Who flipped the hutch latch to take the sneezing rabbit, and why?",
} as unknown as LogicStructure;

const okGuess = {
  guess: { who: "maya", how: "She opened the latch and took it home.", why: "To care for the sick rabbit." },
  reasoning: "latch + note + carrot",
  confidence: 0.85,
};

describe("runReadthroughGate", () => {
  it("passes when the prose-solver solves it and the auditor finds no dangling refs", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(r.passed).toBe(true);
  });

  it("fails with notes when the auditor finds a dangling element", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [{ element: "the latch", where: "solution", note: "never mentioned" }] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(r.passed).toBe(false);
    expect(r.notes).toContain("the latch");
  });

  it("fails when the prose-solver cannot solve it from the story", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: false, who_match: false, how_match: false, why_match: false, confidence_floor_violated: false, notes: "guessed the wrong person" }),
      },
    );
    expect(r.passed).toBe(false);
    expect(r.notes).toContain("wrong person");
  });

  it("combines solvability and dangling failures in the notes", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [{ element: "the latch", where: "solution", note: "never mentioned" }] }),
        compare: async () => ({ passed: false, who_match: false, how_match: true, why_match: true, confidence_floor_violated: false, notes: "guessed the wrong person" }),
      },
    );
    expect(r.passed).toBe(false);
    expect(r.notes).toContain("wrong person");
    expect(r.notes).toContain("the latch");
  });

  it("fail-closed when the solver malfunctions, but ignores an auditor malfunction", async () => {
    const solverDown = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: false, error: "model down" }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(solverDown.passed).toBe(false);
    expect(solverDown.notes).toContain("solver error");

    const auditorDown = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "...", ageRange: "10-11" as const },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: false, error: "model down" }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(auditorDown.passed).toBe(true);
  });
});

const narrativeOk = {
  ok: true as const,
  value: { title: "The Case", narrative_text: "...", annotations: [] },
  attemptsUsed: 1,
  missingCluesByAttempt: [],
};

describe("writeAndVerifyProse", () => {
  it("returns ok on the first draft when the gate passes", async () => {
    let calls = 0;
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", ageRange: "10-11", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async () => { calls++; return narrativeOk; },
        gate: async () => ({ passed: true, notes: "ok" }),
      },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("retries prose with the gate notes, then succeeds", async () => {
    let calls = 0;
    let secondCallNotes: string | undefined;
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", ageRange: "10-11", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async (extraNotes) => { calls++; if (calls === 2) secondCallNotes = extraNotes; return narrativeOk; },
        gate: async () => (calls < 2 ? { passed: false, notes: "the latch is missing" } : { passed: true, notes: "ok" }),
      },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondCallNotes).toContain("the latch is missing");
  });

  it("escalates after readthrough attempts are exhausted", async () => {
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", ageRange: "10-11", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async () => narrativeOk,
        gate: async () => ({ passed: false, notes: "still unsolvable" }),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.escalationNotes).toContain("still unsolvable");
  });
});
