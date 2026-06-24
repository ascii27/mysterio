import { describe, expect, it } from "vitest";
import { buildLogicStructureSystem } from "./logicStructure.system.js";

describe("buildLogicStructureSystem", () => {
  it("includes the central_question schema field and rule", () => {
    const s = buildLogicStructureSystem("easy", "10-11");
    expect(s).toContain("central_question");
  });

  it("interpolates the difficulty misdirection guidance", () => {
    expect(buildLogicStructureSystem("hard", "10-11").toLowerCase()).toContain("obvious suspect");
    expect(buildLogicStructureSystem("easy", "10-11").toLowerCase()).toContain("simple red herrings");
  });

  it("includes the PUZZLE_CRAFT guidance", () => {
    expect(buildLogicStructureSystem("medium", "10-11")).toContain("MYSTERY CRAFT — PUZZLE DESIGN");
  });

  it("describes a detective-agnostic second-person detective", () => {
    const s = buildLogicStructureSystem("easy", "10-11");
    expect(s).toContain('"You"');
    expect(s.toLowerCase()).toContain("second person");
    expect(s).not.toContain("name provided in the user message");
  });

  it("scales the solvability benchmark to the age band's lower bound", () => {
    expect(buildLogicStructureSystem("easy", "8-9")).toContain("careful 8-year-old");
    expect(buildLogicStructureSystem("easy", "12-13")).toContain("careful 12-year-old");
    expect(buildLogicStructureSystem("easy", "8-9")).not.toContain("eight-year-old");
  });

  it("injects the age-band subtlety nudge", () => {
    expect(buildLogicStructureSystem("easy", "8-9")).toContain("AGE BAND: 8-9 — Lean toward the OBVIOUS end");
    expect(buildLogicStructureSystem("easy", "12-13")).toContain("AGE BAND: 12-13 — Lean toward SUBTLE");
  });

  it("includes the CAST FROM ROSTER convention", () => {
    const s = buildLogicStructureSystem("easy", "10-11");
    expect(s).toContain("CAST FROM THE TOWN ROSTER");
    expect(s.toLowerCase()).toContain("at most one");
  });

  it("frames generation as open-ended and Maple-Hollow-bound, with no fixed categories", () => {
    const sys = buildLogicStructureSystem("easy", "10-11");
    expect(sys).toContain("Maple Hollow");
    expect(sys).toContain("case_type");
    // No fixed category menu anymore:
    expect(sys).not.toContain("missing-pet");
    expect(sys).not.toContain("haunted-mansion");
    // No category-plausibility rule anymore:
    expect(sys).not.toContain("plausible for the category");
  });
});
