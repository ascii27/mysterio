import { describe, expect, it } from "vitest";
import { buildProseSolverSystem } from "./proseSolver.system.js";

describe("buildProseSolverSystem", () => {
  it("casts the solver as a reader at the band's benchmark age", () => {
    expect(buildProseSolverSystem("8-9")).toContain("sharp 8-year-old");
    expect(buildProseSolverSystem("10-11")).toContain("sharp 10-year-old");
    expect(buildProseSolverSystem("12-13")).toContain("sharp 12-year-old");
  });

  it("no longer hardcodes a 12-year-old for the youngest band", () => {
    expect(buildProseSolverSystem("8-9")).not.toContain("12-year-old");
  });
});
