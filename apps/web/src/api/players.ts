import type { AgeRange, DifficultyId, Player } from "@mysterio/shared";
import { api } from "./client.js";

export function listPlayers(): Promise<{ players: Player[] }> {
  return api("/api/players");
}

export function createPlayer(body: {
  name: string;
  age_range: AgeRange;
  default_difficulty: DifficultyId;
  avatar_description?: string;
}): Promise<{ player: Player }> {
  return api("/api/players", { method: "POST", body: JSON.stringify(body) });
}

export function deletePlayer(id: string): Promise<void> {
  return api(`/api/players/${id}`, { method: "DELETE" });
}

export function updatePlayer(id: string, patch: {
  name?: string;
  age_range?: AgeRange;
  default_difficulty?: DifficultyId;
  avatar_description?: string;
}): Promise<{ player: Player }> {
  return api(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function generateAvatar(id: string): Promise<{ player: Player }> {
  return api(`/api/players/${id}/avatar`, { method: "POST" });
}

export interface Trophy {
  mystery_id: string;
  title: string | null;
  cover_image_path: string | null;
  difficulty: DifficultyId;
  solved_at: number;
  culprit_name: string | null;
  how: string | null;
}

export function listTrophies(playerId: string): Promise<{ trophies: Trophy[] }> {
  return api(`/api/players/${playerId}/trophies`);
}
