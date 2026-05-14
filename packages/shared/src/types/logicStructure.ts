import { z } from "zod";
import type {
  characterRoleSchema,
  clueCategoryTypeSchema,
  characterSchema,
  essentialClueSchema,
  falseClueSchema,
  trueSolutionSchema,
  logicStructureSchema,
} from "../schemas/logicStructure.js";

export type CharacterRole = z.infer<typeof characterRoleSchema>;
export type ClueCategoryType = z.infer<typeof clueCategoryTypeSchema>;
export type Character = z.infer<typeof characterSchema>;
export type EssentialClue = z.infer<typeof essentialClueSchema>;
export type FalseClue = z.infer<typeof falseClueSchema>;
export type TrueSolution = z.infer<typeof trueSolutionSchema>;
export type LogicStructure = z.infer<typeof logicStructureSchema>;

export interface RedactedLogicStructure {
  category: LogicStructure["category"];
  setting: string;
  characters: Array<Pick<Character, "id" | "name" | "role" | "description">>;
  essential_clues: EssentialClue[];
}
