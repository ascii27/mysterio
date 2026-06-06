import { describe, expect, it } from "vitest";
import { DIFFICULTY_POINTS, RANKS, reputationFor, pointsForDifficulties } from "./reputation.js";

describe("reputation model", () => {
  it("difficulty points are easy 1 / medium 2 / hard 3", () => {
    expect(DIFFICULTY_POINTS).toEqual({ easy: 1, medium: 2, hard: 3 });
  });

  it("ranks are Rookie/Junior Sleuth/Detective/Master at 0/3/9/21", () => {
    expect(RANKS.map((r) => r.threshold)).toEqual([0, 3, 9, 21]);
    expect(RANKS.map((r) => r.name)).toEqual([
      "Rookie", "Junior Sleuth", "Detective", "Master Detective",
    ]);
  });

  it("maps points to the highest rank whose threshold is reached", () => {
    expect(reputationFor(0).rank_name).toBe("Rookie");
    expect(reputationFor(2).rank_name).toBe("Rookie");
    expect(reputationFor(3).rank_name).toBe("Junior Sleuth");
    expect(reputationFor(8).rank_name).toBe("Junior Sleuth");
    expect(reputationFor(9).rank_name).toBe("Detective");
    expect(reputationFor(21).rank_name).toBe("Master Detective");
  });

  it("reports progress toward the next rank", () => {
    const r = reputationFor(3); // start of Junior Sleuth; next is Detective@9, gap 6
    expect(r.next_threshold).toBe(9);
    expect(r.points_to_next).toBe(6);
    expect(r.progress_fraction).toBe(0);
    const mid = reputationFor(6); // halfway through the 3..9 gap
    expect(mid.points_to_next).toBe(3);
    expect(mid.progress_fraction).toBeCloseTo(0.5);
  });

  it("treats the top rank as terminal (null next, fraction 1)", () => {
    const r = reputationFor(100);
    expect(r.rank_name).toBe("Master Detective");
    expect(r.next_threshold).toBeNull();
    expect(r.points_to_next).toBeNull();
    expect(r.progress_fraction).toBe(1);
  });

  it("floors negative/fractional points", () => {
    expect(reputationFor(-5).points).toBe(0);
    expect(reputationFor(2.9).rank_name).toBe("Rookie");
  });

  it("sums difficulty points", () => {
    expect(pointsForDifficulties(["easy", "medium", "hard"])).toBe(6);
    expect(pointsForDifficulties([])).toBe(0);
  });
});
