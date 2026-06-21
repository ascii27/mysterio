import type { CharacterListItem, CharacterDetail, Place } from "@mysterio/shared";
import { api } from "./client.js";

export function listCharacters(): Promise<{ characters: CharacterListItem[] }> {
  return api("/api/characters");
}

export function getCharacter(id: string, playerId: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function listPlaces(): Promise<{ places: Place[] }> {
  return api("/api/places");
}
