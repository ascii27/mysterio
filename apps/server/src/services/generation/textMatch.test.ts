import { describe, expect, it } from "vitest";
import { findMissingClues, tokenSetRatio } from "./textMatch.js";

describe("tokenSetRatio", () => {
  it("returns 1 when one set is a subset of the other", () => {
    expect(tokenSetRatio("the muddy boots", "There were muddy boots by the back door")).toBe(1);
  });

  it("returns 0 for unrelated strings", () => {
    expect(tokenSetRatio("rocket science", "tuna sandwich")).toBe(0);
  });

  it("handles short words by filtering them out", () => {
    expect(tokenSetRatio("a b c", "a b c")).toBe(0);
  });
});

describe("findMissingClues", () => {
  it("returns ids of clues whose description tokens are not in the narrative", () => {
    const clues = [
      { id: "boots", description: "muddy boots in the hallway" },
      { id: "ribbon", description: "a pink ribbon with silver thread" },
    ];
    const narrative = "There were muddy hallway boots by the door.";
    const missing = findMissingClues(clues, narrative, 0.75);
    expect(missing).toContain("ribbon");
    expect(missing).not.toContain("boots");
  });
});
