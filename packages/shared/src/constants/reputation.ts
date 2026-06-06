import type { DifficultyId } from "./difficulties.js";

/** Points awarded for solving a case, by the mystery's difficulty. */
export const DIFFICULTY_POINTS: Record<DifficultyId, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export interface Rank {
  id: string;
  name: string;
  /** Cumulative reputation points required to reach this rank. */
  threshold: number;
  /** Medal color (hex) for the RankBadge. */
  medal: string;
}

/** Named ranks with geometrically growing gaps (3, 6, 12 — each doubles). */
export const RANKS: readonly Rank[] = [
  { id: "rookie", name: "Rookie", threshold: 0, medal: "#c98a5b" },
  { id: "sleuth", name: "Junior Sleuth", threshold: 3, medal: "#c9cdd6" },
  { id: "detective", name: "Detective", threshold: 9, medal: "#e8b04b" },
  { id: "master", name: "Master Detective", threshold: 21, medal: "#7fd1ff" },
] as const;

export interface ReputationSummary {
  points: number;
  rank_index: number;
  rank_name: string;
  /** Points needed to reach the next rank, or null at the terminal rank. */
  next_threshold: number | null;
  points_to_next: number | null;
  /** 0..1 progress within the current rank's gap; 1 at the terminal rank. */
  progress_fraction: number;
}

/** Server-attached DTO: a reputation summary plus the raw solved-case count. */
export interface PlayerReputation extends ReputationSummary {
  solved_count: number;
}

/** Pure: derive the rank/progress for a points total. Order-independent. */
export function reputationFor(points: number): ReputationSummary {
  const p = Math.max(0, Math.floor(points));
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (p >= RANKS[i]!.threshold) idx = i;
  }
  const current = RANKS[idx]!;
  const next = RANKS[idx + 1] ?? null;
  if (!next) {
    return {
      points: p, rank_index: idx, rank_name: current.name,
      next_threshold: null, points_to_next: null, progress_fraction: 1,
    };
  }
  const span = next.threshold - current.threshold;
  const into = p - current.threshold;
  return {
    points: p, rank_index: idx, rank_name: current.name,
    next_threshold: next.threshold,
    points_to_next: next.threshold - p,
    progress_fraction: span > 0 ? into / span : 0,
  };
}

export function pointsForDifficulties(difficulties: DifficultyId[]): number {
  return difficulties.reduce((sum, d) => sum + (DIFFICULTY_POINTS[d] ?? 0), 0);
}
