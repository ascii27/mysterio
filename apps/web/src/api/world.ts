import type { CharacterListItem, CharacterDetail, Place, PlaceDetail } from "@mysterio/shared";
import { api } from "./client.js";

export function listCharacters(): Promise<{ characters: CharacterListItem[] }> {
  return api("/api/characters");
}

export function getCharacter(id: string, playerId: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function regeneratePortrait(id: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}/portrait`, { method: "POST" });
}

export function listPlaces(): Promise<{ places: Place[] }> {
  return api("/api/places");
}

export function getPlace(id: string, playerId: string): Promise<{ place: PlaceDetail }> {
  return api(`/api/places/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function regeneratePlaceImage(id: string): Promise<{ place: Place }> {
  return api(`/api/places/${encodeURIComponent(id)}/image`, { method: "POST" });
}
