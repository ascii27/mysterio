import { describe, expect, it } from "vitest";
import { AGE_RANGES, ageBandConfig } from "./ageRanges.js";

describe("ageBandConfig", () => {
  it("returns a config for every age range, with guidance copy", () => {
    for (const id of AGE_RANGES) {
      const b = ageBandConfig(id);
      expect(b.id).toBe(id);
      expect(typeof b.benchmarkAge).toBe("number");
      expect(b.vocabulary.length).toBeGreaterThan(10);
      expect(b.subtletyNudge.length).toBeGreaterThan(10);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it("benchmarkAge is the lower bound of the band", () => {
    expect(ageBandConfig("8-9").benchmarkAge).toBe(8);
    expect(ageBandConfig("10-11").benchmarkAge).toBe(10);
    expect(ageBandConfig("12-13").benchmarkAge).toBe(12);
  });

  it("subtlety scales: youngest leans obvious, oldest leans subtle", () => {
    expect(ageBandConfig("8-9").subtletyNudge.toLowerCase()).toContain("obvious");
    expect(ageBandConfig("12-13").subtletyNudge.toLowerCase()).toContain("subtle");
  });

  it("throws on an unknown age range", () => {
    expect(() => ageBandConfig("99-100" as never)).toThrow();
  });
});
