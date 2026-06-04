import { describe, expect, it } from "vitest";
import { buildLogicStructureSystem } from "./logicStructure.system.js";

describe("buildLogicStructureSystem", () => {
  it("includes the central_question schema field and rule", () => {
    const s = buildLogicStructureSystem("easy");
    expect(s).toContain("central_question");
  });

  it("interpolates the difficulty misdirection guidance", () => {
    expect(buildLogicStructureSystem("hard").toLowerCase()).toContain("obvious suspect");
    expect(buildLogicStructureSystem("easy").toLowerCase()).toContain("simple red herrings");
  });

  it("includes the PUZZLE_CRAFT guidance", () => {
    expect(buildLogicStructureSystem("medium")).toContain("MYSTERY CRAFT — PUZZLE DESIGN");
  });

  it("describes a detective-agnostic second-person detective", () => {
    const s = buildLogicStructureSystem("easy");
    expect(s).toContain('"You"');
    expect(s.toLowerCase()).toContain("second person");
    expect(s).not.toContain("name provided in the user message");
  });
});
