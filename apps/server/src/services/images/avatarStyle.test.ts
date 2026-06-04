import { describe, expect, it } from "vitest";
import { buildAvatarPrompt } from "./avatarStyle.js";

describe("buildAvatarPrompt", () => {
  it("weaves in the description and uses a portrait style", () => {
    const p = buildAvatarPrompt("a kid with curly red hair and a green coat");
    expect(p).toContain("a kid with curly red hair and a green coat");
    expect(p.toLowerCase()).toContain("portrait");
  });

  it("includes the child-safety clause (no text in image)", () => {
    const p = buildAvatarPrompt("anything");
    expect(p).toContain("Child-friendly and age-appropriate for ages 8-13");
    expect(p).toContain("No text, no words, no letters");
  });
});
