import { api } from "./client.js";

export interface SolveOptions {
  characters: { id: string; name: string }[];
  how_options: string[];
  why_options: string[];
}

export function getSolveOptions(mysteryId: string, playerId: string): Promise<SolveOptions> {
  return api(`/api/mysteries/${mysteryId}/solve-options?player_id=${encodeURIComponent(playerId)}`);
}
