import { describe, expect, it } from "vitest";
import { PUZZLE_CRAFT, PROSE_CRAFT } from "./craftGuidance.js";

describe("craft guidance", () => {
  it("PUZZLE_CRAFT covers all puzzle-design principles", () => {
    expect(PUZZLE_CRAFT.length).toBeGreaterThan(100);
    const t = PUZZLE_CRAFT.toLowerCase();
    for (const phrase of ["fair play", "plain sight", "obvious suspect", "multiple viable suspects", "ground the motive"]) {
      expect(t, `PUZZLE_CRAFT missing: ${phrase}`).toContain(phrase);
    }
  });

  it("PROSE_CRAFT covers all prose principles", () => {
    expect(PROSE_CRAFT.length).toBeGreaterThan(100);
    const t = PROSE_CRAFT.toLowerCase();
    for (const phrase of ["steady drip", "foreshadow", "atmosphere", "reader engagement", "dialogue"]) {
      expect(t, `PROSE_CRAFT missing: ${phrase}`).toContain(phrase);
    }
  });
});
