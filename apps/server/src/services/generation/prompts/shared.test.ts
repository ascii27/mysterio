import { describe, expect, it } from "vitest";
import { SAFETY_PREAMBLE } from "./shared.js";

describe("SAFETY_PREAMBLE", () => {
  it("stays age-band-neutral — no hardcoded eight-year-old vocabulary floor", () => {
    expect(SAFETY_PREAMBLE).not.toContain("eight-year-old");
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain("age-appropriate");
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain("age band");
  });
});
