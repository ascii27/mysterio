import { describe, expect, it } from "vitest";
import { STYLE_VERSION, buildCoverPrompt } from "./style.js";

const baseInput = {
  caseType: "missing-pet",
  title: "The Case of the Empty Hutch",
  centralQuestion: "Who slipped the rabbit out of the locked hutch overnight, and how?",
  setting: "A cozy suburban backyard on a Saturday morning.",
};

describe("buildCoverPrompt", () => {
  it("includes the shared storybook style preamble", () => {
    const p = buildCoverPrompt(baseInput);
    expect(p.toLowerCase()).toContain("storybook");
    expect(p.toLowerCase()).toContain("illustration");
  });

  it("includes a no-text / child-friendly safety clause", () => {
    const p = buildCoverPrompt(baseInput).toLowerCase();
    expect(p).toContain("no text");
    expect(p).toMatch(/child|kid|all ages|age-appropriate/);
    expect(p).toMatch(/non-?violent|not scary|non-?scary/);
  });

  it("uses the title, setting, and central question for scene content", () => {
    const p = buildCoverPrompt(baseInput);
    expect(p).toContain(baseInput.title);
    expect(p).toContain(baseInput.setting);
    expect(p).toContain(baseInput.centralQuestion);
  });

  it("uses the free-text case_type as the scene flavor", () => {
    const p = buildCoverPrompt({ ...baseInput, caseType: "sabotaged bake-off" });
    expect(p).toContain("sabotaged bake-off");
  });

  it("ignores extra solution/culprit keys and never leaks them", () => {
    const withSpoilers = {
      ...baseInput,
      true_solution: "Mr. Hops was set free by Grandpa Otto",
      culprit: "Grandpa Otto",
      false_clues: ["the muddy boots"],
    } as unknown as Parameters<typeof buildCoverPrompt>[0];
    const p = buildCoverPrompt(withSpoilers);
    expect(p).not.toContain("Grandpa Otto");
    expect(p).not.toContain("true_solution");
    expect(p).not.toContain("culprit");
    expect(p).not.toContain("muddy boots");
  });

  it("exposes a STYLE_VERSION string", () => {
    expect(typeof STYLE_VERSION).toBe("string");
    expect(STYLE_VERSION.length).toBeGreaterThan(0);
  });
});
