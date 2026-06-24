import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { usesRosterResident } from "./roster.js";
import type { CastPool } from "./roster.js";

function ls(charIds: { id: string; role: LogicStructure["characters"][number]["role"] }[]): LogicStructure {
  return {
    case_type: "test case",
    setting: "A cozy corner of Maple Hollow on a quiet afternoon.",
    characters: charIds.map((c) => ({
      id: c.id, name: c.id === "you" ? "You" : c.id, role: c.role,
      description: "A described townsperson with at least ten characters.",
      is_culprit: false, motive: null,
    })),
    essential_clues: [], false_clues: [],
    true_solution: { who_did_it: "x", how: "x".repeat(10), why: "x".repeat(10) },
    how_distractors: ["a", "b", "c"], why_distractors: ["a", "b", "c"],
    logic_chain: [], central_question: "x".repeat(10),
  } as unknown as LogicStructure; // partial fixture — we only read characters here
}

const pool = (ids: string[]): CastPool => ({
  characters: ids.map((id) => ({ id, name: id, description: "d", traits: null })),
  places: [],
});

describe("usesRosterResident", () => {
  it("returns true when the pool is empty (nothing to enforce)", () => {
    expect(usesRosterResident(ls([{ id: "you", role: "detective" }]), pool([]))).toBe(true);
  });
  it("returns true when a non-detective character reuses a roster id", () => {
    const logic = ls([{ id: "you", role: "detective" }, { id: "mabel", role: "suspect" }]);
    expect(usesRosterResident(logic, pool(["mabel", "theo"]))).toBe(true);
  });
  it("returns false when no character matches the roster", () => {
    const logic = ls([{ id: "you", role: "detective" }, { id: "stranger", role: "suspect" }]);
    expect(usesRosterResident(logic, pool(["mabel", "theo"]))).toBe(false);
  });
  it("ignores the detective even if its id matches a roster id", () => {
    const logic = ls([{ id: "mabel", role: "detective" }]);
    expect(usesRosterResident(logic, pool(["mabel"]))).toBe(false);
  });
});
