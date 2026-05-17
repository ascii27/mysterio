import type { Clue, ClueCategoryType } from "@mysterio/shared";
import { api } from "./client.js";

export function listClues(mysteryId: string): Promise<{ clues: Clue[] }> {
  return api(`/api/mysteries/${mysteryId}/clues`);
}

export function createClue(
  mysteryId: string,
  body: {
    category_type: ClueCategoryType;
    content: string;
    source?: "manual" | "annotation";
    annotation_id?: string;
  },
): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues`, { method: "POST", body: JSON.stringify(body) });
}

export function updateClue(mysteryId: string, clueId: string, content: string): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "PATCH", body: JSON.stringify({ content }) });
}

export function deleteClue(mysteryId: string, clueId: string): Promise<void> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "DELETE" });
}
