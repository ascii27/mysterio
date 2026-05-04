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
  default_difficulty: DifficultyId;
  created_at: number;
}

export interface MysterySummary {
  id: string;
  player_id: string;
  category: CategoryId;
  difficulty: DifficultyId;
  status: MysteryStatus;
  title: string | null;
  created_at: number;
  ready_at: number | null;
  solved: boolean; // derived: solutions row exists with is_correct=1
}
