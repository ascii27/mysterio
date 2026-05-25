import type { LogicStructure } from "@mysterio/shared";
import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

const ls: LogicStructure = {
  category: "missing-pet",
  setting: "A backyard.",
  characters: [
    { id: "h", name: "H", role: "detective", description: "x".repeat(20), is_culprit: false, motive: null },
    { id: "l", name: "L", role: "suspect", description: "x".repeat(20), is_culprit: true, motive: "wanted pet" },
  ],
  essential_clues: [{ id: "a", description: "x".repeat(20), category_type: "item" }],
  false_clues: [{ id: "b", description: "x".repeat(20) }],
  true_solution: { who_did_it: "l", how: "x".repeat(20), why: "x".repeat(20) },
  how_distractors: ["aaa", "bbb", "ccc"],
  why_distractors: ["ddd", "eee", "fff"],
  logic_chain: ["x".repeat(20), "y".repeat(20), "z".repeat(20)],
  central_question: "Who took the pet, how did they get in, and why would they do it?",
};

describe("redact", () => {
  it("strips is_culprit and motive from characters", () => {
    const r = redact(ls);
    for (const c of r.characters) {
      expect(c).not.toHaveProperty("is_culprit");
      expect(c).not.toHaveProperty("motive");
    }
  });

  it("omits false_clues, true_solution, and logic_chain", () => {
    const r = redact(ls) as unknown as Record<string, unknown>;
    expect(r).not.toHaveProperty("false_clues");
    expect(r).not.toHaveProperty("true_solution");
    expect(r).not.toHaveProperty("logic_chain");
  });

  it("preserves essential_clues verbatim", () => {
    const r = redact(ls);
    expect(r.essential_clues).toEqual(ls.essential_clues);
  });

  it("has exactly the expected top-level keys", () => {
    const r = redact(ls);
    expect(Object.keys(r).sort()).toEqual(["category", "characters", "essential_clues", "setting"]);
  });
});
