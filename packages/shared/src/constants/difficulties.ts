export const DIFFICULTIES = [
  {
    id: "easy",
    name: "Easy",
    essentialClues: 3,
    falseCluesMin: 1,
    falseCluesMax: 2,
    targetWords: 600,
    wordToleranceFraction: 0.15,
  },
  {
    id: "medium",
    name: "Medium",
    essentialClues: 4,
    falseCluesMin: 3,
    falseCluesMax: 4,
    targetWords: 900,
    wordToleranceFraction: 0.15,
  },
  {
    id: "hard",
    name: "Hard",
    essentialClues: 5,
    falseCluesMin: 5,
    falseCluesMax: 7,
    targetWords: 1200,
    wordToleranceFraction: 0.15,
  },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]["id"];
export const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id) as readonly DifficultyId[];

export function difficultyConfig(id: DifficultyId) {
  const found = DIFFICULTIES.find((d) => d.id === id);
  if (!found) throw new Error(`unknown difficulty ${id}`);
  return found;
}
