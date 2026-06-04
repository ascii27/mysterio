import { describe, expect, it } from "vitest";
import { buildNarrativeSystem } from "./narrative.system.js";

describe("buildNarrativeSystem", () => {
  it("includes the PROSE_CRAFT guidance", () => {
    expect(buildNarrativeSystem("easy", "10-11")).toContain("MYSTERY CRAFT — PROSE");
  });

  it("instructs the writer to establish the central question early", () => {
    expect(buildNarrativeSystem("easy", "10-11").toLowerCase()).toContain("central question");
  });

  it("targets the age band in the audience line", () => {
    expect(buildNarrativeSystem("easy", "8-9")).toContain("for ages 8-9");
    expect(buildNarrativeSystem("easy", "12-13")).toContain("for ages 12-13");
  });

  it("injects the age-band vocabulary guidance", () => {
    expect(buildNarrativeSystem("easy", "8-9")).toContain("Short, simple sentences");
    expect(buildNarrativeSystem("easy", "12-13")).toContain("Longer, varied sentences");
  });
});
