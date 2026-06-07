import type { AgeRange, CategoryId, DifficultyId, LogicStructure, MysterySummary, MysteryStatus, NarrativeAnnotation } from "@mysterio/shared";
import { api } from "./client.js";

export interface MysteryDetail {
  id: string;
  player_id: string;
  category: CategoryId;
  difficulty: DifficultyId;
  target_age_range: AgeRange | null;
  status: MysteryStatus;
  title: string | null;
  narrative_text: string | null;
  narrative_annotations: NarrativeAnnotation[] | null;
  audio_url: string | null;
  cover_image_url: string | null;
  central_question: string | null;
  characters?: PublicCharacter[];
  created_at: string;
  ready_at: string | null;
  failure_reason: string | null;
}

export interface PublicCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
}

export function generateMystery(input: {
  player_id: string;
  category: CategoryId;
  difficulty: DifficultyId;
}): Promise<{ mystery_id: string; status: MysteryStatus }> {
  return api("/api/mysteries/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getMystery(id: string): Promise<MysteryDetail> {
  return api(`/api/mysteries/${id}`);
}

export interface ClueCoverage {
  id: string;
  description: string;
  present: boolean;
  score: number;
}

export interface MysteryDebug {
  id: string;
  status: MysteryStatus;
  failure_reason: string | null;
  logic_structure: LogicStructure | null;
  validation: { passed: boolean | null; attempts: number; notes: string | null };
  clue_coverage: ClueCoverage[];
  metrics: {
    difficulty: string;
    essential_count: number;
    false_count: number;
    word_count: number;
    target_words: number | null;
    min_words: number | null;
    max_words: number | null;
  };
}

export function getMysteryDebug(id: string): Promise<MysteryDebug> {
  return api(`/api/mysteries/${id}/debug`);
}

export function listMysteries(playerId: string, limit = 10): Promise<{ mysteries: MysterySummary[] }> {
  return api(`/api/mysteries?player_id=${encodeURIComponent(playerId)}&limit=${limit}`);
}

export function generateAudio(id: string): Promise<{ audio_url: string }> {
  return api(`/api/mysteries/${id}/audio`, { method: "POST" });
}
