import { describe, expect, it } from "vitest";
import type { TrueSolution } from "@mysterio/shared";
import { compareSolutions } from "./compareSolutions.js";

const truth: TrueSolution = {
  who_did_it: "lulu",
  how: "Lulu lured Biscuit into the playhouse with tuna and shut the door.",
  why: "She wanted to keep Biscuit as her pet for the morning.",
};

const baseGuess = {
  guess: {
    who: "lulu",
    how: "She used tuna to get the cat into the playhouse and closed it in.",
    why: "She wanted a pet of her own.",
  },
  reasoning: "tuna can in playhouse + ribbon snagged on latch = Lulu",
  confidence: 0.9,
};

const passingGrader = async () => ({ match: true, reason: "ok" });

describe("compareSolutions", () => {
  it("passes when who matches, both grader calls match, confidence ≥ 0.5", async () => {
    const r = await compareSolutions(baseGuess, truth, { grader: passingGrader });
    expect(r.passed).toBe(true);
  });

  it("fails when who is wrong even if how/why pass", async () => {
    const r = await compareSolutions({ ...baseGuess, guess: { ...baseGuess.guess, who: "pemberton" } }, truth, { grader: passingGrader });
    expect(r.passed).toBe(false);
    expect(r.who_match).toBe(false);
    expect(r.notes).toContain("clues did not uniquely point");
  });

  it("fails when how grader returns no match", async () => {
    const r = await compareSolutions(baseGuess, truth, {
      grader: async (c, ref) => (ref === truth.how ? { match: false, reason: "different method" } : { match: true, reason: "ok" }),
    });
    expect(r.passed).toBe(false);
    expect(r.how_match).toBe(false);
    expect(r.notes).toContain("\"how\" did not match");
  });

  it("fails when confidence is below 0.5 even on full match", async () => {
    const r = await compareSolutions({ ...baseGuess, confidence: 0.4 }, truth, { grader: passingGrader });
    expect(r.passed).toBe(false);
    expect(r.confidence_floor_violated).toBe(true);
  });

  it("notes are non-empty when passed=true", async () => {
    const r = await compareSolutions(baseGuess, truth, { grader: passingGrader });
    expect(r.notes).toContain("Validation passed");
  });

  it("passes when confidence is exactly 0.5 (floor is strict <)", async () => {
    const r = await compareSolutions({ ...baseGuess, confidence: 0.5 }, truth, { grader: passingGrader });
    expect(r.passed).toBe(true);
    expect(r.confidence_floor_violated).toBe(false);
  });
});
