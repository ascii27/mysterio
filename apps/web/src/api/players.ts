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
