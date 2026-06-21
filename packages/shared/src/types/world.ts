import type { z } from "zod";
import type { rosterCharacterSchema, placeSchema, caseAppearanceSchema, roleInCaseSchema } from "../schemas/world.js";

export type RoleInCase = z.infer<typeof roleInCaseSchema>;
export type RosterCharacter = z.infer<typeof rosterCharacterSchema>;
export type Place = z.infer<typeof placeSchema>;
export type CaseAppearance = z.infer<typeof caseAppearanceSchema>;

/** GET /api/characters item — spoiler-safe (count only, no per-case guilt). */
export interface CharacterListItem {
  id: string;
  name: string;
  description: string;
  portrait_image_path: string | null;
  appearance_count: number;
}

/** One appearance in GET /api/characters/:id. is_culprit/motive are OMITTED unless the player resolved that case. */
export interface CharacterAppearance {
  mystery_id: string;
  title: string | null;
  role_in_case: RoleInCase;
  is_culprit?: boolean;
  motive?: string | null;
}

export interface CharacterDetail {
  id: string;
  name: string;
  description: string;
  portrait_image_path: string | null;
  appearances: CharacterAppearance[];
}
