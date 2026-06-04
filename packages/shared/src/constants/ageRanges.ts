export const AGE_RANGES = ["8-9", "10-11", "12-13"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
export const DEFAULT_AGE_RANGE: AgeRange = "10-11";

export const AGE_BANDS = [
  {
    id: "8-9",
    label: "8–9",
    benchmarkAge: 8,
    vocabulary:
      "Short, simple sentences — usually one idea each. Concrete everyday words. " +
      "Avoid subordinate clauses and abstract emotion words.",
    subtletyNudge:
      "Lean toward the OBVIOUS end: the decisive clue should be plainly observable, " +
      "and red herrings stay shallow — even on harder difficulties.",
  },
  {
    id: "10-11",
    label: "10–11",
    benchmarkAge: 10,
    vocabulary:
      "Moderate sentence length with some subordinate clauses. Occasional richer " +
      "words introduced in context.",
    subtletyNudge:
      "Balanced: clues reward attention but never require expert inference.",
  },
  {
    id: "12-13",
    label: "12–13",
    benchmarkAge: 12,
    vocabulary:
      "Longer, varied sentences. Figurative language and more sophisticated emotion " +
      "are welcome.",
    subtletyNudge:
      "Lean toward SUBTLE: require the reader to COMBINE clues; avoid spelling out " +
      "connections — even on easier difficulties.",
  },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

export function ageBandConfig(id: AgeRange): AgeBand {
  const found = AGE_BANDS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown age range ${id}`);
  return found;
}
