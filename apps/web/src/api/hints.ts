import type { Hint } from "@mysterio/shared";
import { api } from "./client.js";

export function listHints(mysteryId: string, playerId: string): Promise<{ hints: Hint[]; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints?player_id=${encodeURIComponent(playerId)}`);
}

export function requestHint(mysteryId: string, playerId: string): Promise<{ hint: Hint; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`, { method: "POST", body: JSON.stringify({ player_id: playerId }) });
}
