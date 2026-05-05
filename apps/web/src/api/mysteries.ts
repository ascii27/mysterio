import type { CategoryId, DifficultyId, MysterySummary, MysteryStatus } from "@mysterio/shared";
import { api } from "./client.js";

export interface MysteryDetail {
  id: string;
  player_id: string;
  category: CategoryId;
  difficulty: DifficultyId;
  status: MysteryStatus;
  title: string | null;
  narrative_text: string | null;
  audio_url: string | null;
  characters?: PublicCharacter[];
  created_at: number;
  ready_at: number | null;
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

export function listMysteries(playerId: string, limit = 10): Promise<{ mysteries: MysterySummary[] }> {
  return api(`/api/mysteries?player_id=${encodeURIComponent(playerId)}&limit=${limit}`);
}
