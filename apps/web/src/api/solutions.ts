import type { Solution } from "@mysterio/shared";
import type { PublicCharacter } from "./mysteries.js";
import { api } from "./client.js";

export interface SolutionResponse {
  solution: Solution | null;
  true_solution: { who_did_it: string; how: string; why: string } | null;
  characters: PublicCharacter[];
  explanation: string | null;
}

export function submitSolution(
  mysteryId: string,
  body: { guess_who: string; guess_how: string; guess_why: string },
): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/submit-solution`, { method: "POST", body: JSON.stringify(body) });
}

export function giveUp(mysteryId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/give-up`, { method: "POST" });
}

export function getSolution(mysteryId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/solution`);
}
