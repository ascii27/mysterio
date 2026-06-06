# Spec 3a — Reputation & Trophy Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each detective a difficulty-weighted reputation that promotes them up a named rank ladder, surface it on the home screen + player picker, and add a Trophy Room of their solved cases.

**Architecture:** Reputation is **fully derived** — `points = Σ DIFFICULTY_POINTS[difficulty]` over the detective's correct solutions; rank = highest threshold ≤ points. No DB migration, no stored counters (progress only ever rises, so derivation is order-independent). A shared rank module is the single source of truth for both the server (compute) and web (display). `GET /players` is augmented with each player's `reputation`; a new `GET /players/:id/trophies` returns solved cases. Web adds a `RankBadge`, a home rank card, a picker chip, and a Trophy Room screen.

**Tech Stack:** pnpm monorepo; `packages/shared` (TS + Zod), `apps/server` (Fastify + Drizzle/SQLite + vitest), `apps/web` (React + Vite, inline-style + CSS-var casebook theme, no unit/lint runner — gate is `typecheck` + `vite build`).

**Design spec:** `docs/superpowers/specs/2026-06-06-reputation-trophy-room-design.md`

**Branch:** `feat/reputation-trophy-room` (already created; the design commit is on it).

**Conventions (per project memory):** relative imports use `.js` extensions even for `.ts` sources. Subagent-driven, sonnet for implementer + both reviewers. Commit after each task.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `packages/shared/src/constants/reputation.ts` | Create | `DIFFICULTY_POINTS`, `RANKS`, `reputationFor()`, `pointsForDifficulties()`, `ReputationSummary`, `PlayerReputation` |
| `packages/shared/src/constants/reputation.test.ts` | Create | Boundary tests for `reputationFor` |
| `packages/shared/src/index.ts` | Modify | Export the new module |
| `packages/shared/src/types/mystery.ts` | Modify | Add `reputation?` to `Player` |
| `apps/server/src/routes/players.ts` | Modify | Augment `GET /players` with `reputation`; add `GET /players/:id/trophies` |
| `apps/server/src/routes/playersReputation.test.ts` | Create | Reputation math on `GET /players` |
| `apps/server/src/routes/trophies.test.ts` | Create | Trophies endpoint shape + culprit resolution |
| `apps/web/src/components/casebook/RankBadge.tsx` | Create | Rank medal disc |
| `apps/web/src/components/casebook/index.ts` | Modify | Export `RankBadge` |
| `apps/web/src/api/players.ts` | Modify | `Trophy` type + `listTrophies()` |
| `apps/web/src/screens/MainScreen/MainScreen.tsx` | Modify | Rank card (replaces hero) + Trophy Room entry button |
| `apps/web/src/screens/PlayerPicker.tsx` | Modify | Rank chip per detective row |
| `apps/web/src/screens/TrophyRoom/TrophyRoom.tsx` | Create | Trophy Room screen + detail drawer |
| `apps/web/src/routes.tsx` | Modify | `/trophies` route |

---

## Task 1: Shared rank model + `Player.reputation`

**Files:**
- Create: `packages/shared/src/constants/reputation.ts`
- Create: `packages/shared/src/constants/reputation.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/types/mystery.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/constants/reputation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/shared test reputation`
Expected: FAIL — `Cannot find module './reputation.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/constants/reputation.ts`:

```ts
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
```

- [ ] **Step 4: Export the module + extend `Player`**

In `packages/shared/src/index.ts`, add after the `ageRanges` export line:

```ts
export * from "./constants/reputation.js";
```

In `packages/shared/src/types/mystery.ts`, add the import at the top (with the other `import type` lines):

```ts
import type { PlayerReputation } from "../constants/reputation.js";
```

and add the field to the `Player` interface (after `created_at`):

```ts
  /** Server-computed; present on the GET /players DTO, absent on raw rows. */
  reputation?: PlayerReputation;
```

- [ ] **Step 5: Run tests + typecheck to verify pass**

Run: `pnpm --filter @mysterio/shared test reputation`
Expected: PASS (all cases).
Run: `pnpm --filter @mysterio/shared build`
Expected: clean (the `Player` import resolves).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/reputation.ts packages/shared/src/constants/reputation.test.ts packages/shared/src/index.ts packages/shared/src/types/mystery.ts
git commit -m "Spec 3a: shared rank model + Player.reputation"
```

---

## Task 2: Reputation on `GET /players`

**Files:**
- Modify: `apps/server/src/routes/players.ts`
- Create: `apps/server/src/routes/playersReputation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/playersReputation.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { mysteries, players, solutions } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

function seedPlayer(id: string) {
  getDb().insert(players).values({ id, name: id, age_range: "10-11", default_difficulty: "easy" }).run();
}
function seedSolvedCase(playerId: string, mysteryId: string, difficulty: "easy" | "medium" | "hard", outcome: { is_correct: number; gave_up?: number }) {
  const db = getDb();
  db.insert(mysteries).values({ id: mysteryId, player_id: playerId, category: "missing-pet", difficulty, status: "ready" }).run();
  db.insert(solutions).values({ id: `s-${mysteryId}-${playerId}`, mystery_id: mysteryId, player_id: playerId, is_correct: outcome.is_correct, gave_up: outcome.gave_up ?? 0 }).run();
}

describe("GET /players reputation", () => {
  it("a detective with no solves is Rookie with 0 points", async () => {
    seedPlayer("p1");
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(0);
    expect(p.reputation.rank_name).toBe("Rookie");
    expect(p.reputation.solved_count).toBe(0);
  });

  it("sums difficulty-weighted points over correct solves only", async () => {
    seedPlayer("p1");
    seedSolvedCase("p1", "m-easy", "easy", { is_correct: 1 });   // +1
    seedSolvedCase("p1", "m-hard", "hard", { is_correct: 1 });   // +3
    seedSolvedCase("p1", "m-wrong", "hard", { is_correct: 0 });  // wrong → 0
    seedSolvedCase("p1", "m-gaveup", "medium", { is_correct: 0, gave_up: 1 }); // give-up → 0
    const list = await app.inject({ method: "GET", url: "/players" });
    const p = list.json().players.find((x: { id: string }) => x.id === "p1");
    expect(p.reputation.points).toBe(4); // 1 + 3
    expect(p.reputation.rank_name).toBe("Junior Sleuth"); // >= 3
    expect(p.reputation.solved_count).toBe(2);
  });

  it("scopes reputation per detective", async () => {
    seedPlayer("p1"); seedPlayer("p2");
    seedSolvedCase("p1", "ma", "hard", { is_correct: 1 });
    seedSolvedCase("p2", "mb", "easy", { is_correct: 1 });
    const list = await app.inject({ method: "GET", url: "/players" });
    const map = Object.fromEntries(list.json().players.map((x: { id: string; reputation: { points: number } }) => [x.id, x.reputation.points]));
    expect(map.p1).toBe(3);
    expect(map.p2).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test playersReputation`
Expected: FAIL — `Cannot read properties of undefined (reading 'points')` (no `reputation` field yet).

- [ ] **Step 3: Write the implementation**

In `apps/server/src/routes/players.ts`:

Add to the imports at the top:

```ts
import { and, eq } from "drizzle-orm";
import { mysteries, players, solutions } from "../db/schema.js";
import { DIFFICULTY_POINTS, reputationFor, type DifficultyId, type PlayerReputation } from "@mysterio/shared";
```

(Replace the existing `import { eq } from "drizzle-orm";` and `import { players } from "../db/schema.js";` lines with the above — `and`, `mysteries`, `solutions` are newly needed.)

Add this helper above `playersRoutes`:

```ts
/** Points + solved-count per detective, derived from their correct solutions. */
function reputationByPlayer(): Map<string, PlayerReputation> {
  const db = getDb();
  const solved = db
    .select({ player_id: solutions.player_id, difficulty: mysteries.difficulty })
    .from(solutions)
    .innerJoin(mysteries, eq(solutions.mystery_id, mysteries.id))
    .where(eq(solutions.is_correct, 1))
    .all();
  const points = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of solved) {
    points.set(r.player_id, (points.get(r.player_id) ?? 0) + (DIFFICULTY_POINTS[r.difficulty as DifficultyId] ?? 0));
    counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);
  }
  const out = new Map<string, PlayerReputation>();
  for (const [pid, pts] of points) {
    out.set(pid, { ...reputationFor(pts), solved_count: counts.get(pid) ?? 0 });
  }
  return out;
}

const ROOKIE: PlayerReputation = { ...reputationFor(0), solved_count: 0 };
```

Replace the `GET /players` handler body:

```ts
  app.get("/players", async () => {
    const db = getDb();
    const rows = db.select().from(players).all();
    const reps = reputationByPlayer();
    return { players: rows.map((p) => ({ ...p, reputation: reps.get(p.id) ?? ROOKIE })) };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test playersReputation`
Expected: PASS.
Run: `pnpm --filter @mysterio/server typecheck`
Expected: clean.

- [ ] **Step 5: Run the existing players test to confirm no regression**

Run: `pnpm --filter @mysterio/server test src/routes/players.test.ts`
Expected: PASS (the list assertions still hold; rows now also carry `reputation`).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/players.ts apps/server/src/routes/playersReputation.test.ts
git commit -m "Spec 3a: derive reputation on GET /players"
```

---

## Task 3: Trophies endpoint

**Files:**
- Modify: `apps/server/src/routes/players.ts`
- Create: `apps/server/src/routes/trophies.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/trophies.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { mysteries, players, solutions } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

const LOGIC = JSON.stringify({
  characters: [
    { id: "ms-green", name: "Ms. Green" },
    { id: "mr-blue", name: "Mr. Blue" },
  ],
  true_solution: { who_did_it: "ms-green", how: "She used the spare key.", why: "To borrow it." },
});

function seedSolved(playerId: string, mysteryId: string, opts: { is_correct: number; status?: string; title?: string }) {
  const db = getDb();
  db.insert(players).values({ id: playerId, name: playerId, age_range: "10-11", default_difficulty: "easy" }).onConflictDoNothing().run();
  db.insert(mysteries).values({
    id: mysteryId, player_id: playerId, category: "missing-pet", difficulty: "medium",
    status: opts.status ?? "ready", title: opts.title ?? "The Case", cover_image_path: "covers/x.png",
    logic_structure_json: LOGIC,
  }).run();
  db.insert(solutions).values({ id: `s-${mysteryId}`, mystery_id: mysteryId, player_id: playerId, is_correct: opts.is_correct }).run();
}

describe("GET /players/:id/trophies", () => {
  it("lists solved cases with resolved culprit name + how", async () => {
    seedSolved("p1", "m1", { is_correct: 1, title: "The Borrowed Tortoise" });
    const res = await app.inject({ method: "GET", url: "/players/p1/trophies" });
    expect(res.statusCode).toBe(200);
    const trophies = res.json().trophies;
    expect(trophies).toHaveLength(1);
    expect(trophies[0]).toMatchObject({
      mystery_id: "m1",
      title: "The Borrowed Tortoise",
      difficulty: "medium",
      cover_image_path: "covers/x.png",
      culprit_name: "Ms. Green",
      how: "She used the spare key.",
    });
  });

  it("excludes wrong guesses and non-ready mysteries", async () => {
    seedSolved("p1", "m-wrong", { is_correct: 0 });
    seedSolved("p1", "m-pending", { is_correct: 1, status: "pending" });
    const res = await app.inject({ method: "GET", url: "/players/p1/trophies" });
    expect(res.json().trophies).toHaveLength(0);
  });

  it("returns an empty list for a detective with no solves", async () => {
    getDb().insert(players).values({ id: "p2", name: "p2", age_range: "8-9", default_difficulty: "easy" }).run();
    const res = await app.inject({ method: "GET", url: "/players/p2/trophies" });
    expect(res.statusCode).toBe(200);
    expect(res.json().trophies).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test trophies`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Write the implementation**

In `apps/server/src/routes/players.ts`, add this handler inside `playersRoutes` (after the `/players/:id/avatar` handler, before the closing brace):

```ts
  app.get<{ Params: { id: string } }>("/players/:id/trophies", async (req) => {
    const db = getDb();
    const rows = db
      .select({
        mystery_id: mysteries.id,
        title: mysteries.title,
        cover_image_path: mysteries.cover_image_path,
        difficulty: mysteries.difficulty,
        logic: mysteries.logic_structure_json,
        solved_at: solutions.created_at,
      })
      .from(solutions)
      .innerJoin(mysteries, eq(solutions.mystery_id, mysteries.id))
      .where(and(
        eq(solutions.player_id, req.params.id),
        eq(solutions.is_correct, 1),
        eq(mysteries.status, "ready"),
      ))
      .all();

    const trophies = rows
      .map((r) => {
        let culprit_name: string | null = null;
        let how: string | null = null;
        try {
          const ls = JSON.parse(r.logic ?? "") as {
            characters?: Array<{ id: string; name: string }>;
            true_solution?: { who_did_it?: string; how?: string };
          };
          how = typeof ls.true_solution?.how === "string" ? ls.true_solution.how : null;
          const who = ls.true_solution?.who_did_it;
          culprit_name = ls.characters?.find((c) => c.id === who)?.name ?? null;
        } catch {
          // malformed/absent logic structure — leave culprit/how null
        }
        return {
          mystery_id: r.mystery_id,
          title: r.title,
          cover_image_path: r.cover_image_path,
          difficulty: r.difficulty,
          solved_at: r.solved_at,
          culprit_name,
          how,
        };
      })
      .sort((a, b) => b.solved_at - a.solved_at);

    return { trophies };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test trophies`
Expected: PASS.
Run: `pnpm --filter @mysterio/server typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/players.ts apps/server/src/routes/trophies.test.ts
git commit -m "Spec 3a: GET /players/:id/trophies (solved cases + culprit)"
```

---

## Task 4: `RankBadge` component + web API client

**Files:**
- Create: `apps/web/src/components/casebook/RankBadge.tsx`
- Modify: `apps/web/src/components/casebook/index.ts`
- Modify: `apps/web/src/api/players.ts`

> No web unit-test runner (per project facts) — the gate is `typecheck` + `vite build`.

- [ ] **Step 1: Create the `RankBadge` component**

Create `apps/web/src/components/casebook/RankBadge.tsx`:

```tsx
import { RANKS } from "@mysterio/shared";

export function RankBadge({ rankIndex, size = 48 }: { rankIndex: number; size?: number }) {
  const rank = RANKS[Math.max(0, Math.min(RANKS.length - 1, rankIndex))]!;
  return (
    <div
      aria-hidden="true"
      title={rank.name}
      style={{
        width: size, height: size, borderRadius: "50%", flex: "0 0 auto",
        display: "grid", placeItems: "center",
        background: `radial-gradient(120% 120% at 30% 25%, ${rank.medal}, rgba(0,0,0,0.28))`,
        color: "#2b2318", fontFamily: "var(--display)", fontWeight: 800,
        fontSize: size * 0.42, lineHeight: 1,
        border: "3px solid var(--cream)",
        boxShadow: "0 2px 6px -1px rgba(0,0,0,0.45)",
      }}
    >
      {rank.name[0]}
    </div>
  );
}
```

- [ ] **Step 2: Export it**

In `apps/web/src/components/casebook/index.ts`, add:

```ts
export { RankBadge } from "./RankBadge.js";
```

- [ ] **Step 3: Add the trophies API client**

In `apps/web/src/api/players.ts`, add the import for `DifficultyId` (extend the existing top import) and append:

```ts
export interface Trophy {
  mystery_id: string;
  title: string | null;
  cover_image_path: string | null;
  difficulty: DifficultyId;
  solved_at: number;
  culprit_name: string | null;
  how: string | null;
}

export function listTrophies(playerId: string): Promise<{ trophies: Trophy[] }> {
  return api(`/api/players/${playerId}/trophies`);
}
```

The top import line becomes:

```ts
import type { AgeRange, DifficultyId, Player } from "@mysterio/shared";
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean.
Run: `pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/casebook/RankBadge.tsx apps/web/src/components/casebook/index.ts apps/web/src/api/players.ts
git commit -m "Spec 3a: RankBadge component + trophies API client"
```

---

## Task 5: MainScreen rank card + Trophy Room entry

**Files:**
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx`

- [ ] **Step 1: Replace the hero block with a rank card**

In `apps/web/src/screens/MainScreen/MainScreen.tsx`, add `RankBadge` to the casebook import:

```ts
import { Kicker, RankBadge } from "../../components/casebook/index.js";
```

Replace the entire "Welcome back" hero `<div>` (the block from `<div style={{ background: "linear-gradient(135deg, #f3ead0, #e7d6ac)", ... }}>` through its closing `</div>`, currently lines ~51–67) with:

```tsx
      {(() => {
        const rep = player?.reputation;
        const rankIndex = rep?.rank_index ?? 0;
        const rankName = rep?.rank_name ?? "Rookie";
        const pct = Math.round((rep?.progress_fraction ?? 0) * 100);
        return (
          <div
            style={{
              background: "linear-gradient(135deg, #f3ead0, #e7d6ac)",
              padding: 18, borderRadius: "var(--radius-lg)", border: "1px solid var(--line)",
              boxShadow: "0 2px 8px -3px rgba(40,28,12,0.3), inset 4px 0 0 var(--accent)",
              marginBottom: 24, display: "flex", gap: 14, alignItems: "center",
            }}
          >
            <RankBadge rankIndex={rankIndex} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--display)", fontWeight: 700 }}>
                {rankName}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontFamily: "var(--display)" }}>
                Detective {player?.name ?? ""} 🕵️
              </div>
              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(74,52,24,0.18)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--gold)", transition: "width .3s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 5 }}>
                {rep?.points_to_next != null
                  ? `${rep.points_to_next} more to ${RANKS_NEXT_NAME(rankIndex)} · ${rep.solved_count ?? 0} solved`
                  : `Top rank! · ${rep?.solved_count ?? 0} solved`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/trophies")}
              style={{ flex: "0 0 auto", padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}
            >
              🏆<br />Trophies
            </button>
          </div>
        );
      })()}
```

Add this import at the top (with the other shared import) so the helper can name the next rank:

```ts
import { type CategoryId, type DifficultyId, difficultyConfig, RANKS } from "@mysterio/shared";
```

(Extend the existing `@mysterio/shared` import line to add `RANKS`.)

And add this small helper just above the `MainScreen` function:

```ts
function RANKS_NEXT_NAME(rankIndex: number): string {
  return RANKS[rankIndex + 1]?.name ?? "Master Detective";
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean (note: `navigate` is already in scope in `MainScreen`).
Run: `pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/MainScreen/MainScreen.tsx
git commit -m "Spec 3a: MainScreen rank card + Trophy Room entry"
```

---

## Task 6: PlayerPicker rank chip

**Files:**
- Modify: `apps/web/src/screens/PlayerPicker.tsx`

- [ ] **Step 1: Add a rank chip to each detective row**

In `apps/web/src/screens/PlayerPicker.tsx`, find the name span inside the select button:

```tsx
                <span style={{ flex: 1, fontFamily: "var(--display)", fontWeight: 700, fontSize: 22 }}>{p.name}</span>
```

Replace it with a name + rank-chip column:

```tsx
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, lineHeight: 1.05 }}>{p.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>
                    {p.reputation?.rank_name ?? "Rookie"}
                  </span>
                </span>
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean (`p.reputation` is typed via the shared `Player` change in Task 1).
Run: `pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/PlayerPicker.tsx
git commit -m "Spec 3a: rank chip on PlayerPicker rows"
```

---

## Task 7: Trophy Room screen + route

**Files:**
- Create: `apps/web/src/screens/TrophyRoom/TrophyRoom.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Create the Trophy Room screen**

Create `apps/web/src/screens/TrophyRoom/TrophyRoom.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { difficultyConfig } from "@mysterio/shared";
import { listPlayers, listTrophies, type Trophy } from "../../api/players.js";
import { usePlayerStore } from "../../state/playerStore.js";
import { Kicker, RankBadge, Chip } from "../../components/casebook/index.js";

function solvedDate(ms: number): string {
  return new Date(ms * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TrophyRoom() {
  const navigate = useNavigate();
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const [open, setOpen] = useState<Trophy | null>(null);

  const { data: playersData } = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const player = playersData?.players.find((p) => p.id === playerId);
  const { data, isLoading } = useQuery({ queryKey: ["trophies", playerId], queryFn: () => listTrophies(playerId) });

  const trophies = data?.trophies ?? [];
  const rep = player?.reputation;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 26 }}>Trophy Room</h1>
      </header>

      <div style={{ display: "flex", gap: 14, alignItems: "center", background: "linear-gradient(135deg,#f3ead0,#e7d6ac)", borderRadius: "var(--radius-lg)", padding: 18, border: "1px solid var(--line)", boxShadow: "inset 4px 0 0 var(--gold)", marginBottom: 20 }}>
        <RankBadge rankIndex={rep?.rank_index ?? 0} size={64} />
        <div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>{trophies.length} solved</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>{rep?.rank_name ?? "Rookie"} · Detective {player?.name ?? ""}</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Loading…</div>
      ) : trophies.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "var(--text-dim)" }}>
          <div style={{ fontSize: 46 }}>🏆</div>
          <p>Your shelf is waiting. Solve your first case to earn a trophy!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {trophies.map((t) => (
            <button
              key={t.mystery_id}
              type="button"
              onClick={() => setOpen(t)}
              style={{ textAlign: "left", padding: 0, borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)", border: "2px solid var(--gold)", boxShadow: "0 8px 20px -10px rgba(232,176,75,0.5)", cursor: "pointer" }}
            >
              <div style={{ position: "relative", height: 88, background: "var(--surface-2)" }}>
                {t.cover_image_path && (
                  <img src={`/images/${t.cover_image_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <div style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: "var(--good)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>✓</div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>{t.title ?? "Untitled case"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 5 }}>⭐ Solved · {solvedDate(t.solved_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <TrophyDetail trophy={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TrophyDetail({ trophy, onClose }: { trophy: Trophy; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(8,5,16,0.6)" }} />
      <div style={{ position: "relative", background: "var(--bg)", borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "85%", overflowY: "auto", padding: 22, boxShadow: "0 -20px 40px -20px rgba(0,0,0,0.8)" }}>
        <button type="button" onClick={onClose} style={{ position: "absolute", top: 12, right: 14, width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer", fontSize: 16 }}>✕</button>
        {trophy.cover_image_path && (
          <img src={`/images/${trophy.cover_image_path}`} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: "var(--radius)", marginBottom: 14 }} />
        )}
        <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>{trophy.title ?? "Untitled case"}</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Chip tone="good">✓ Solved · {solvedDate(trophy.solved_at)}</Chip>
          <Chip tone="ink">{difficultyConfig(trophy.difficulty).name}</Chip>
        </div>
        {trophy.culprit_name && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 800, textTransform: "uppercase", fontFamily: "var(--display)" }}>The culprit</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19 }}>{trophy.culprit_name}</div>
          </div>
        )}
        {trophy.how && <p style={{ color: "var(--ink-dim)", fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{trophy.how}</p>}
      </div>
    </div>
  );
}
```

> **Note on `Chip`:** it's already exported from `components/casebook`. If `tone="good"`/`tone="ink"` are not valid `tone` values, open `apps/web/src/components/casebook/Chip.tsx`, read its `tone` prop union, and use the nearest existing tones (e.g. a positive/green tone and a neutral/ink tone). Do not invent new tone values — match the component.

- [ ] **Step 2: Register the route**

In `apps/web/src/routes.tsx`, add the import:

```tsx
import { TrophyRoom } from "./screens/TrophyRoom/TrophyRoom.js";
```

and add the route inside `<RRRoutes>` (before the catch-all `*` route):

```tsx
      <Route path="/trophies" element={<TrophyRoom />} />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean. If `Chip` tone values error, fix per the note above and re-run.
Run: `pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/TrophyRoom/TrophyRoom.tsx apps/web/src/routes.tsx
git commit -m "Spec 3a: Trophy Room screen + /trophies route"
```

---

## Task 8: Verification + deploy

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `pnpm --filter @mysterio/shared test`
Run: `pnpm --filter @mysterio/server test`
Run: `pnpm --filter @mysterio/server typecheck`
Run: `pnpm --filter @mysterio/web typecheck`
Run: `pnpm --filter @mysterio/web build`
Expected: all green.

- [ ] **Step 2: Deploy to exe.dev** (the standard test step before iPad validation)

Run: `bash scripts/deploy.sh`
Expected: build → rsync → migrate (no new migrations) → restart → `/api/health` returns `{"ok":true,"db":true}`.

- [ ] **Step 3: Hand off the iPad checklist**

On `https://panther-golem.exe.xyz/`:
1. PlayerPicker shows each detective's rank chip (e.g. "ROOKIE").
2. Home shows the rank card: badge + rank name + progress meter + "N more to <next> · K solved".
3. Tap "🏆 Trophies" → Trophy Room: header with badge + "K solved", a grid of solved cases (or the empty-shelf state for a fresh detective).
4. Tap a solved case → detail drawer shows cover, difficulty, the culprit name, and the how.
5. Solve a fresh case (any difficulty) → return home → rank meter advanced by 1/2/3 per easy/medium/hard; the new case appears in the Trophy Room.
6. Give up or guess wrong on another case → rank meter unchanged; that case is NOT in the Trophy Room.

---

## Self-Review (completed during authoring)

- **Spec coverage:** scoring scheme (Task 1), no-penalty/derived model (Tasks 1–2), `GET /players` reputation → home card + picker chip (Tasks 2, 5, 6), trophies endpoint + Trophy Room (Tasks 3, 7), RankBadge (Task 4), all three surfaces (Tasks 5–7), start-at-Rookie-0 (derived, Task 2 first test), Trophy Room culprit name + how, no portrait (Task 7). ✓
- **Type consistency:** `ReputationSummary`/`PlayerReputation` fields (`rank_index`, `rank_name`, `points`, `next_threshold`, `points_to_next`, `progress_fraction`, `solved_count`) used identically across server (Task 2) and web (Tasks 5–7). `Trophy` fields match the server response (Task 3) and the web type (Task 4). ✓
- **No migration:** confirmed — no `db/migrations` or `schema.ts` changes anywhere. ✓
- **Placeholder scan:** none — every code step is complete; the only conditional is the `Chip` tone note, which gives an explicit resolution path. ✓
