import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { parseNarrativeAnnotations } from "./parseAnnotations.js";

function ls(): LogicStructure {
  return {
    category: "missing-pet",
    setting: "A backyard on a Saturday morning.",
    characters: [
      { id: "lily", name: "Lily", role: "detective", description: "...", is_culprit: false, motive: null },
      { id: "oliver", name: "Oliver", role: "suspect", description: "...", is_culprit: true, motive: "to keep Snowdrop company" },
      { id: "jasper", name: "Jasper", role: "suspect", description: "...", is_culprit: false, motive: null },
    ],
    essential_clues: [
      { id: "clover-trail", description: "A trail of fresh clover sprigs.", category_type: "item" },
      { id: "empty-hutch", description: "Sounds from an empty hutch.", category_type: "location" },
      { id: "grandma-note", description: "A note about a grandma visiting.", category_type: "note" },
    ],
    false_clues: [],
    true_solution: { who_did_it: "oliver", how: "x", why: "y" },
    logic_chain: ["a", "b", "c"],
  } as LogicStructure;
}

describe("parseNarrativeAnnotations", () => {
  it("returns the input unchanged when there are no tags", () => {
    const input = "It was a quiet morning. Nothing was tagged.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe(input);
    expect(out.annotations).toEqual([]);
  });

  it("extracts a single person tag and computes the offset in clean text", () => {
    const input = "Lily knelt by the hutch. [p:oliver]Oliver[/p] lived two houses down.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Lily knelt by the hutch. Oliver lived two houses down.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 25, length: 6, text: "Oliver" },
    ]);
  });

  it("extracts a single clue tag", () => {
    const input = "She saw a [c:clover-trail]trail of clover sprigs[/c] across the grass.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("She saw a trail of clover sprigs across the grass.");
    expect(out.annotations).toEqual([
      { type: "clue", id: "clover-trail", offset: 10, length: 22, text: "trail of clover sprigs" },
    ]);
  });

  it("handles multiple tags in order, with correct offsets after stripping", () => {
    const input = "[p:oliver]Oliver[/p] left a [c:clover-trail]trail of clover[/c]. [p:jasper]Jasper[/p] watched.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Oliver left a trail of clover. Jasper watched.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 0, length: 6, text: "Oliver" },
      { type: "clue", id: "clover-trail", offset: 14, length: 15, text: "trail of clover" },
      { type: "person", id: "jasper", offset: 31, length: 6, text: "Jasper" },
    ]);
  });

  it("drops a tag whose id does not exist in the LogicStructure but keeps the inner text", () => {
    const input = "[p:phantom]Phantom[/p] was there.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Phantom was there.");
    expect(out.annotations).toEqual([]);
  });

  it("drops a person tag that points at the detective (kid is detective, no need to highlight self)", () => {
    const input = "[p:lily]Lily[/p] knelt by the hutch.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Lily knelt by the hutch.");
    expect(out.annotations).toEqual([]);
  });

  it("drops a clue tag whose id is not in essential_clues", () => {
    const input = "[c:bogus-id]thing[/c] was there.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("thing was there.");
    expect(out.annotations).toEqual([]);
  });

  it("handles tags adjacent with no surrounding whitespace", () => {
    const input = "[p:oliver]Oliver[/p][c:clover-trail]left clover[/c].";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Oliverleft clover.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 0, length: 6, text: "Oliver" },
      { type: "clue", id: "clover-trail", offset: 6, length: 11, text: "left clover" },
    ]);
  });

  it("handles a tag whose inner text contains regex-special characters", () => {
    const input = "Found a note: [c:grandma-note](handwritten) note about grandma.[/c] Curious.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Found a note: (handwritten) note about grandma. Curious.");
    expect(out.annotations).toEqual([
      { type: "clue", id: "grandma-note", offset: 14, length: 33, text: "(handwritten) note about grandma." },
    ]);
  });
});
