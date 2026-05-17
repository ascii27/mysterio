import { describe, expect, it } from "vitest";
import { logicStructureSchema } from "./logicStructure.js";

const valid = {
  category: "missing-pet",
  setting: "A cozy suburban backyard on a Saturday morning.",
  characters: [
    { id: "hazel", name: "Hazel", role: "detective", description: "An eight-year-old who knows every cat on the block.", is_culprit: false, motive: null },
    { id: "lulu", name: "Lulu", role: "suspect", description: "Hazel's little sister who has been begging for a kitten.", is_culprit: true, motive: "Wanted a pet of her own." },
    { id: "pemberton", name: "Mr. Pemberton", role: "suspect", description: "Grumpy neighbor who hates cats in his garden.", is_culprit: false, motive: null },
    { id: "biscuit", name: "Biscuit", role: "witness", description: "The missing ginger cat with a taste for tuna.", is_culprit: false, motive: null },
  ],
  essential_clues: [
    { id: "tuna-can", description: "An empty tuna can on the floor of the playhouse.", category_type: "item" },
    { id: "ribbon", description: "A pink ribbon, the kind Lulu wears in her hair, snagged on the playhouse latch.", category_type: "item" },
    { id: "warm-blanket", description: "A still-warm blanket inside the playhouse, where Biscuit usually doesn't sleep.", category_type: "location" },
  ],
  false_clues: [
    { id: "open-window", description: "A window that was left open overnight." },
  ],
  true_solution: {
    who_did_it: "lulu",
    how: "Lulu coaxed Biscuit into her playhouse with tuna and shut the door.",
    why: "She wanted to keep Biscuit as her own pet for the morning.",
  },
  how_distractors: [
    "Mr. Pemberton scared Biscuit through the open window into the playhouse.",
    "A neighbor's dog chased Biscuit into the playhouse for safety.",
    "Hazel was practicing hide-and-seek with Biscuit and locked the door by accident.",
  ],
  why_distractors: [
    "She wanted to hide Biscuit from Mr. Pemberton.",
    "She thought Biscuit was lost and was rescuing him.",
    "She was practicing taking care of pets for school.",
  ],
  logic_chain: [
    "The tuna can in the playhouse means someone lured Biscuit there.",
    "The ribbon belongs to Lulu and was snagged on the playhouse latch.",
    "The warm blanket means Biscuit was inside recently — therefore Lulu brought him there.",
  ],
};

describe("logicStructureSchema", () => {
  it("accepts a well-formed structure", () => {
    expect(() => logicStructureSchema.parse(valid)).not.toThrow();
  });

  it("rejects when no character is the culprit", () => {
    const bad = structuredClone(valid);
    bad.characters[1]!.is_culprit = false;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("exactly one character")),
      ).toBe(true);
    }
  });

  it("rejects when true_solution.who_did_it does not match the culprit id", () => {
    const bad = structuredClone(valid);
    bad.true_solution.who_did_it = "pemberton";
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("must match the culprit's character id")),
      ).toBe(true);
    }
  });

  it("rejects when true_solution.who_did_it references a non-existent character id", () => {
    const bad = structuredClone(valid);
    bad.true_solution.who_did_it = "ghost-character";
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("reference an existing character")),
      ).toBe(true);
    }
  });

  it("rejects duplicate clue ids", () => {
    const bad = structuredClone(valid);
    bad.false_clues.push({ id: "tuna-can", description: "Another tuna can." });
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("duplicate clue id")),
      ).toBe(true);
    }
  });

  it("rejects fewer than 3 essential clues", () => {
    const bad = structuredClone(valid);
    bad.essential_clues = bad.essential_clues.slice(0, 2);
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("rejects when there is no detective character", () => {
    const bad = structuredClone(valid);
    bad.characters[0]!.role = "witness";
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes(`exactly one character must have role "detective"`)),
      ).toBe(true);
    }
  });

  it("rejects when the detective character is also the culprit", () => {
    const bad = structuredClone(valid);
    // Flip culprit from suspect to detective
    bad.characters[1]!.is_culprit = false;
    bad.characters[0]!.is_culprit = true;
    bad.true_solution.who_did_it = bad.characters[0]!.id;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("detective character must not be the culprit")),
      ).toBe(true);
    }
  });

  it("rejects when how_distractors contains the true solution's how", () => {
    const bad = structuredClone(valid);
    bad.how_distractors[0] = bad.true_solution.how;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("how_distractors must not contain the true solution"))).toBe(true);
    }
  });

  it("rejects when how_distractors has duplicates", () => {
    const bad = structuredClone(valid);
    bad.how_distractors[1] = bad.how_distractors[0]!;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("how_distractors must contain 3 distinct strings"))).toBe(true);
    }
  });

  it("rejects when why_distractors contains the true solution's why", () => {
    const bad = structuredClone(valid);
    bad.why_distractors[0] = bad.true_solution.why;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("why_distractors must not contain the true solution"))).toBe(true);
    }
  });

  it("rejects when why_distractors has duplicates", () => {
    const bad = structuredClone(valid);
    bad.why_distractors[1] = bad.why_distractors[0]!;
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("why_distractors must contain 3 distinct strings"))).toBe(true);
    }
  });
});
