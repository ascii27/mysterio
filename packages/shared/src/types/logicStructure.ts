import type { CategoryId } from "../constants/categories.js";

export type CharacterRole = "detective" | "suspect" | "witness" | "bystander";
export type ClueCategoryType = "character" | "item" | "location" | "event" | "note";

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  description: string;
  is_culprit: boolean;
  motive: string | null;
}

export interface EssentialClue {
  id: string;
  description: string;
  category_type: ClueCategoryType;
}

export interface FalseClue {
  id: string;
  description: string;
}

export interface TrueSolution {
  who_did_it: string;
  how: string;
  why: string;
}

export interface LogicStructure {
  category: CategoryId;
  setting: string;
  characters: Character[];
  essential_clues: EssentialClue[];
  false_clues: FalseClue[];
  true_solution: TrueSolution;
  logic_chain: string[];
}

export interface RedactedLogicStructure {
  category: CategoryId;
  setting: string;
  characters: Array<Pick<Character, "id" | "name" | "role" | "description">>;
  essential_clues: EssentialClue[];
}
