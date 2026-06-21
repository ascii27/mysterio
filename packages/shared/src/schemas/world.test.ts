import { describe, expect, it } from "vitest";
import { rosterCharacterSchema, placeSchema, caseAppearanceSchema } from "./world.js";

describe("world schemas", () => {
  it("parses a valid roster character", () => {
    const c = rosterCharacterSchema.parse({
      id: "old-man-hawthorne",
      name: "Old Man Hawthorne",
      description: "The town clockmaker, gruff but fair.",
      traits: "precise, suspicious of strangers",
      portrait_image_path: null,
      is_seed: true,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(c.id).toBe("old-man-hawthorne");
    expect(c.traits).toBe("precise, suspicious of strangers");
  });

  it("allows null traits and portrait", () => {
    const c = rosterCharacterSchema.parse({
      id: "newcomer",
      name: "Newcomer",
      description: "A brand-new face in town.",
      traits: null,
      portrait_image_path: null,
      is_seed: false,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(c.traits).toBeNull();
  });

  it("parses a place", () => {
    const p = placeSchema.parse({
      id: "maple-diner",
      name: "The Maple Diner",
      description: "A cozy diner on Main Street.",
      image_path: null,
      is_seed: true,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(p.id).toBe("maple-diner");
  });

  it("parses an appearance", () => {
    const a = caseAppearanceSchema.parse({
      id: "m1_old-man-hawthorne",
      mystery_id: "m1",
      character_id: "old-man-hawthorne",
      role_in_case: "suspect",
      is_culprit: false,
      motive: null,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(a.role_in_case).toBe("suspect");
  });

  it.each(["suspect", "witness", "bystander"] as const)(
    "parses an appearance with role_in_case=%s",
    (role) => {
      const a = caseAppearanceSchema.parse({
        id: `m1_c1`,
        mystery_id: "m1",
        character_id: "c1",
        role_in_case: role,
        is_culprit: false,
        motive: null,
        created_at: "2026-06-21T00:00:00.000Z",
      });
      expect(a.role_in_case).toBe(role);
    },
  );

  it("rejects an invalid role_in_case", () => {
    expect(() =>
      caseAppearanceSchema.parse({
        id: "x", mystery_id: "m1", character_id: "c1",
        role_in_case: "detective", is_culprit: false, motive: null,
        created_at: "2026-06-21T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
