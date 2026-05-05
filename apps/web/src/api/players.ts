import type { Player } from "@mysterio/shared";
import { api } from "./client.js";

export function listPlayers(): Promise<{ players: Player[] }> {
  return api("/api/players");
}
