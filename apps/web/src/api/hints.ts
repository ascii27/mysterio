import type { Hint } from "@mysterio/shared";
import { api } from "./client.js";

export function listHints(mysteryId: string): Promise<{ hints: Hint[]; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`);
}

export function requestHint(mysteryId: string): Promise<{ hint: Hint; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`, { method: "POST" });
}
