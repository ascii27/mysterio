import { describe, expect, it } from "vitest";
import { DIFFICULTY_IDS, difficultyConfig } from "./difficulties.js";

describe("difficulty misdirection", () => {
  it("every difficulty has a non-empty misdirection descriptor", () => {
    for (const id of DIFFICULTY_IDS) {
      const d = difficultyConfig(id);
      expect(typeof d.misdirection).toBe("string");
      expect(d.misdirection.length).toBeGreaterThan(10);
    }
  });

  it("scales: hard mentions an obvious suspect, easy does not", () => {
    expect(difficultyConfig("hard").misdirection.toLowerCase()).toContain("obvious suspect");
    expect(difficultyConfig("easy").misdirection.toLowerCase()).not.toContain("obvious suspect");
  });
});
