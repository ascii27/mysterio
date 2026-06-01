import { describe, expect, it } from "vitest";
import { buildNarrativeSystem } from "./narrative.system.js";

describe("buildNarrativeSystem", () => {
  it("includes the PROSE_CRAFT guidance", () => {
    expect(buildNarrativeSystem("easy")).toContain("MYSTERY CRAFT — PROSE");
  });

  it("instructs the writer to establish the central question early", () => {
    expect(buildNarrativeSystem("easy").toLowerCase()).toContain("central question");
  });
});
