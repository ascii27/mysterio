function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/** Token-set ratio: |intersection| / |smaller set|. 0..1. */
export function tokenSetRatio(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Returns the list of clue ids that did NOT match the narrative above the threshold. */
export function findMissingClues(
  clues: Array<{ id: string; description: string }>,
  narrative: string,
  threshold = 0.75,
): string[] {
  const missing: string[] = [];
  for (const c of clues) {
    if (tokenSetRatio(c.description, narrative) < threshold) missing.push(c.id);
  }
  return missing;
}
