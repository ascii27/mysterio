import { difficultyConfig, type DifficultyId } from "@mysterio/shared";

export function buildLogicStructureSystem(difficulty: DifficultyId): string {
  const d = difficultyConfig(difficulty);
  return `You are a mystery designer for a kids' game.

Your output is a single JSON object that conforms exactly to the schema described below. Output ONLY the JSON — no prose, no markdown fences, no commentary.

DIFFICULTY: ${d.name} — produce exactly ${d.essentialClues} essential clues and ${d.falseCluesMin}-${d.falseCluesMax} false clues.

SCHEMA:
{
  "category": "<one of: missing-pet | haunted-mansion | stolen-treasure | locked-room>",
  "setting": "<2-4 sentences describing where and when the mystery takes place>",
  "characters": [
    { "id": "<lowercase kebab-case unique id>",
      "name": "<character's display name>",
      "role": "<one of: detective | suspect | witness | bystander>",
      "description": "<2-3 sentences>",
      "is_culprit": <true for exactly one character; false for all others>,
      "motive": "<1 sentence; null for non-culprits>" },
    ... (3-8 characters total; exactly one detective, exactly one is_culprit=true)
  ],
  "essential_clues": [
    { "id": "<kebab-case unique id>",
      "description": "<a concrete observable detail; 1-2 sentences>",
      "category_type": "<one of: character | item | location | event | note>" },
    ... (exactly ${d.essentialClues} entries)
  ],
  "false_clues": [
    { "id": "<kebab-case unique id>",
      "description": "<a plausible distraction that does NOT actually point at the culprit>" },
    ... (${d.falseCluesMin}-${d.falseCluesMax} entries)
  ],
  "true_solution": {
    "who_did_it": "<the id of the culprit character>",
    "how": "<one sentence describing the method>",
    "why": "<one sentence describing the motive>"
  },
  "logic_chain": [
    "<each entry combines clues already introduced to deduce part of the true_solution; ordered>",
    ... (3-8 entries)
  ]
}

DESIGN RULES:
- The mystery MUST be solvable from the essential_clues alone, by a careful eight-year-old, without ever needing the false_clues or off-screen knowledge.
- Each essential clue must point uniquely toward the culprit's identity, method, or motive — not all three. Spread coverage across clues.
- The logic_chain must be tight: each step reasons from clues introduced earlier, ending in the true_solution.
- Characters must have distinct, age-appropriate names — no real famous people.
- Setting must be plausible for the category (a backyard for missing-pet, an old country house for haunted-mansion, a museum/attic/treehouse for stolen-treasure, a locked study/bedroom/treehouse for locked-room).`;
}
