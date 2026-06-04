import type { AgeRange } from "../constants/ageRanges.js";
import type { CategoryId } from "../constants/categories.js";
import type { DifficultyId } from "../constants/difficulties.js";

export const MYSTERY_STATUSES = [
  "pending",
  "generating_logic",
  "validating",
  "writing",
  "synthesizing",
  "ready",
  "failed",
] as const;
export type MysteryStatus = (typeof MYSTERY_STATUSES)[number];

export const TERMINAL_STATUSES: readonly MysteryStatus[] = ["ready", "failed"];

export interface Player {
  id: string;
  name: string;
  age_range: AgeRange;
  default_difficulty: DifficultyId;
  avatar_description: string | null;
  created_at: number;
}

export interface MysterySummary {
  id: string;
  player_id: string | null; // creator (provenance only; null if the creator was deleted)
  category: CategoryId;
  difficulty: DifficultyId;
  target_age_range: AgeRange | null;
  status: MysteryStatus;
  title: string | null;
  created_at: number;
  ready_at: number | null;
  solved: boolean;  // derived: this detective has a correct solution row
  started: boolean; // derived: this detective has any clue/solution row for this mystery
}
