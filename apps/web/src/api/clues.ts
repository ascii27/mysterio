import type { Clue, ClueCategoryType } from "@mysterio/shared";
import { api } from "./client.js";

export function listClues(mysteryId: string, playerId: string): Promise<{ clues: Clue[] }> {
  return api(`/api/mysteries/${mysteryId}/clues?player_id=${encodeURIComponent(playerId)}`);
}

export function createClue(
  mysteryId: string,
  playerId: string,
  body: {
    category_type: ClueCategoryType;
    content: string;
    source?: "manual" | "annotation";
    annotation_id?: string;
  },
): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues`, {
    method: "POST",
    body: JSON.stringify({ player_id: playerId, ...body }),
  });
}

export function updateClue(mysteryId: string, playerId: string, clueId: string, content: string): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, {
    method: "PATCH",
    body: JSON.stringify({ player_id: playerId, content }),
  });
}

export function deleteClue(mysteryId: string, playerId: string, clueId: string): Promise<void> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}?player_id=${encodeURIComponent(playerId)}`, { method: "DELETE" });
}
