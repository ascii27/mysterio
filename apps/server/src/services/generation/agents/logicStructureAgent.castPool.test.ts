import { describe, expect, it } from "vitest";
import { buildAvoidSection, buildCastPoolUserSection } from "./logicStructureAgent.js";

describe("buildCastPoolUserSection", () => {
  it("lists provided residents and places with their exact ids", () => {
    const section = buildCastPoolUserSection({
      characters: [{ id: "rosa-pine", name: "Rosa Pine", description: "Diner owner.", traits: "warm" }],
      places: [{ id: "maple-diner", name: "The Maple Diner", description: "A diner." }],
    });
    expect(section).toContain("rosa-pine");
    expect(section).toContain("Rosa Pine");
    expect(section).toContain("The Maple Diner");
    expect(section.toLowerCase()).toContain("at most one");
  });

  it("returns an empty string when the pool has no characters (legacy generation path)", () => {
    expect(buildCastPoolUserSection({ characters: [], places: [] })).toBe("");
  });

  it("returns an empty string when pool is undefined (legacy path)", () => {
    expect(buildCastPoolUserSection(undefined)).toBe("");
  });
});

describe("buildAvoidSection", () => {
  it("lists recent case types to avoid when provided", () => {
    expect(buildAvoidSection(["missing heirloom", "sabotaged bake-off"]))
      .toContain("missing heirloom");
    expect(buildAvoidSection([])).toBe("");
  });
});
