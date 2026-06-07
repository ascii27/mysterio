import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { buildDebugView, type DebugRow } from "./debugView.js";

function makeLogic(): LogicStructure {
  return {
    category: "missing-pet",
    setting: "A sunny backyard with a rabbit hutch.",
    central_question: "Who took Rosie and how did they get past the gate?",
    characters: [
      { id: "you", name: "Mia", role: "detective", description: "The young detective.", is_culprit: false, motive: null },
      { id: "theo", name: "Theo", role: "suspect", description: "Lives past the back fence.", is_culprit: true, motive: "He wanted a pet of his own." },
    ],
    essential_clues: [
      { id: "clover-trail", description: "A trail of fresh clover sprigs leads to a gap in the back fence.", category_type: "event" },
      { id: "open-latch", description: "The hutch latch was lifted, not broken.", category_type: "item" },
    ],
    false_clues: [{ id: "spooked-cat", description: "The neighbor's cat was seen on the shed roof." }],
    true_solution: { who_did_it: "theo", how: "He lifted the latch and lured Rosie with clover.", why: "He wanted a pet." },
    how_distractors: ["A fox dug under.", "The latch broke.", "Theo left the door open by accident."],
    why_distractors: ["For a prank.", "To sell her.", "Because he was angry."],
    logic_chain: ["Clover trail leads to the fence gap.", "Latch was lifted by a person.", "Theo lives past the fence and wanted a pet."],
  };
}

const baseRow: DebugRow = {
  id: "m1",
  status: "ready",
  difficulty: "easy",
  failure_reason: null,
  logic_structure_json: makeLogic(),
  narrative_text:
    "Mia knelt by the hutch. A trail of fresh clover sprigs led to a gap in the back fence. The hutch latch was lifted, not broken. The neighbor's cat watched from the shed roof.",
  validation_passed: true,
  validation_attempts: 2,
  validation_notes: "who/how/why all matched",
};

describe("buildDebugView", () => {
  it("returns the full parsed logic structure", () => {
    const v = buildDebugView(baseRow);
    expect(v.logic_structure?.true_solution.who_did_it).toBe("theo");
    expect(v.logic_structure?.central_question).toContain("Rosie");
  });

  it("computes clue coverage: present clues flagged present, absent ones not", () => {
    const v = buildDebugView(baseRow);
    const byId = Object.fromEntries(v.clue_coverage.map((c) => [c.id, c]));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(byId["clover-trail"]!.present).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(byId["open-latch"]!.present).toBe(true);
  });

  it("flags a missing essential clue", () => {
    const logic = makeLogic();
    const row = { ...baseRow, logic_structure_json: logic, narrative_text: "Mia knelt by the hutch and saw nothing unusual at all today." };
    const v = buildDebugView(row);
    const byId = Object.fromEntries(v.clue_coverage.map((c) => [c.id, c]));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(byId["clover-trail"]!.present).toBe(false);
  });

  it("reports validation + metrics", () => {
    const v = buildDebugView(baseRow);
    expect(v.validation).toEqual({ passed: true, attempts: 2, notes: "who/how/why all matched" });
    expect(v.metrics.essential_count).toBe(2);
    expect(v.metrics.false_count).toBe(1);
    expect(v.metrics.difficulty).toBe("easy");
    expect(v.metrics.target_words).toBe(600);
    expect(v.metrics.word_count).toBeGreaterThan(0);
  });

  it("handles a row with no logic_structure_json", () => {
    const v = buildDebugView({ ...baseRow, logic_structure_json: null, narrative_text: null });
    expect(v.logic_structure).toBeNull();
    expect(v.clue_coverage).toEqual([]);
  });

  it("maps validation_passed=false to passed:false", () => {
    const v = buildDebugView({ ...baseRow, validation_passed: false });
    expect(v.validation.passed).toBe(false);
  });

  it("leaves word-target metrics null for an unknown difficulty", () => {
    const v = buildDebugView({ ...baseRow, difficulty: "ultra" });
    expect(v.metrics.target_words).toBeNull();
    expect(v.metrics.min_words).toBeNull();
    expect(v.metrics.max_words).toBeNull();
  });
});
