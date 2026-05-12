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
  });

  it("rejects when true_solution.who_did_it does not match the culprit id", () => {
    const bad = structuredClone(valid);
    bad.true_solution.who_did_it = "pemberton";
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("rejects duplicate clue ids", () => {
    const bad = structuredClone(valid);
    bad.false_clues.push({ id: "tuna-can", description: "Another tuna can." });
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("rejects fewer than 3 essential clues", () => {
    const bad = structuredClone(valid);
    bad.essential_clues = bad.essential_clues.slice(0, 2);
    const res = logicStructureSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });
});
