# Detective Accounts & Shared-Story Model Implementation Plan (Spec 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make detectives lightweight accounts (create/delete), turn generated stories into a shared pool, scope solve/notes/hints per-(detective, story), and make generated prose detective-agnostic.

**Architecture:** Approach A (scope-in-place). Add `player_id` to `clues`/`solutions`/`hints`; reinterpret `mysteries.player_id` as a nullable creator (`ON DELETE SET NULL`); add `age_range` + `avatar_description` to `players`. Derive per-detective `solved`/`started` from child-row presence. Reverse M5a so the LogicStructure detective is second-person "You". No new tables.

**Tech Stack:** TypeScript, Fastify, Drizzle (SQLite), Zod, Vitest (server); React + Vite + zustand + @tanstack/react-query (web). Shared Zod/types in `@mysterio/shared`.

**Conventions for every task:** exact paths below. Server gate: `pnpm --filter @mysterio/server typecheck` + `pnpm --filter @mysterio/server test`. Shared gate: `pnpm --filter @mysterio/shared build`. Web gate: `pnpm --filter @mysterio/web typecheck` + `pnpm --filter @mysterio/web build` (no web unit runner). Run from repo root. One commit per task with the message shown. Follow TDD where a task has logic. Spec: `docs/superpowers/specs/2026-06-04-detective-accounts-design.md`. Branch: `feat/detective-accounts`.

**Age bands (used throughout):** `'8-9' | '10-11' | '12-13'`.

---

### Task 1: Shared types — age range, detective fields, mystery summary status

**Files:**
- Create: `packages/shared/src/constants/ageRanges.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/types/mystery.ts`

- [ ] **Step 1: Create `packages/shared/src/constants/ageRanges.ts`**

```ts
export const AGE_RANGES = ["8-9", "10-11", "12-13"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
export const DEFAULT_AGE_RANGE: AgeRange = "10-11";
```

- [ ] **Step 2: Export it from `packages/shared/src/index.ts`**

Add this line next to the other `constants/*` exports (after the `voices.js` line):

```ts
export * from "./constants/ageRanges.js";
```

- [ ] **Step 3: Extend `Player` and `MysterySummary` in `packages/shared/src/types/mystery.ts`**

Add the import at the top (after the `DifficultyId` import):

```ts
import type { AgeRange } from "../constants/ageRanges.js";
```

Replace the `Player` interface with:

```ts
export interface Player {
  id: string;
  name: string;
  age_range: AgeRange;
  default_difficulty: DifficultyId;
  avatar_description: string | null;
  created_at: number;
}
```

Replace the `MysterySummary` interface with (adds `started`; `player_id` becomes the nullable creator):

```ts
export interface MysterySummary {
  id: string;
  player_id: string | null; // creator (provenance only; null if the creator was deleted)
  category: CategoryId;
  difficulty: DifficultyId;
  status: MysteryStatus;
  title: string | null;
  created_at: number;
  ready_at: number | null;
  solved: boolean;  // derived: this detective has a correct solution row
  started: boolean; // derived: this detective has any clue/solution row for this mystery
}
```

- [ ] **Step 4: Build shared + commit**

```bash
pnpm --filter @mysterio/shared build && git add packages/shared/src/constants/ageRanges.ts packages/shared/src/index.ts packages/shared/src/types/mystery.ts && git commit -m "M-2a: shared age-range constant + detective/mystery-summary fields"
```

---

### Task 2: DB schema + migration `0003` (per-detective columns + backfill)

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create (generated, then hand-edited): `apps/server/src/db/migrations/0003_*.sql` + meta snapshot + `_journal.json`

This is the riskiest task. SQLite needs a table rebuild to add `NOT NULL` FK columns; the generated migration's `INSERT … SELECT` must be hand-edited to **backfill `player_id` from each row's mystery creator**.

- [ ] **Step 1: Edit `apps/server/src/db/schema.ts`**

Add to the `players` table object (after `default_difficulty`):

```ts
  age_range: text("age_range").notNull().default("10-11"),
  avatar_description: text("avatar_description"),
```

Add to the `players` table's check-constraints callback (alongside `difficultyCheck`):

```ts
  ageRangeCheck: check("players_age_range_chk", sql`${t.age_range} IN ('8-9','10-11','12-13')`),
```

In `mysteries`, change the `player_id` line from:

```ts
  player_id: text("player_id").notNull().references(() => players.id),
```
to (nullable creator, set null on delete):
```ts
  player_id: text("player_id").references(() => players.id, { onDelete: "set null" }),
```

In `clues`, add after `mystery_id`:

```ts
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
```
and change the `annotationUniq` index in the callback to include `player_id`:
```ts
  annotationUniq: uniqueIndex("clues_mystery_annotation_uniq")
    .on(t.mystery_id, t.player_id, t.annotation_id)
    .where(sql`${t.annotation_id} IS NOT NULL`),
```
and add an index in the same callback:
```ts
  mysteryPlayerIdx: index("idx_clues_mystery_player").on(t.mystery_id, t.player_id),
```

In `solutions`, add after `mystery_id`:

```ts
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
```
and change `mysteryUniq` from `.on(t.mystery_id)` to:
```ts
  mysteryUniq: uniqueIndex("solutions_mystery_uniq").on(t.mystery_id, t.player_id),
```

In `hints`, add after `mystery_id`:

```ts
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
```
and add a table-callback (the `hints` table currently has none — give it one):
```ts
}, (t) => ({
  mysteryPlayerIdx: index("idx_hints_mystery_player").on(t.mystery_id, t.player_id),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: a new `apps/server/src/db/migrations/0003_*.sql` plus an updated `meta/0003_snapshot.json` and `_journal.json`. Because of the NOT NULL FK additions and the `mysteries.player_id` nullability change, the SQL will contain **table rebuilds** (`PRAGMA foreign_keys=OFF; CREATE TABLE __new_clues …; INSERT INTO __new_clues(...) SELECT ... FROM clues; DROP TABLE clues; ALTER TABLE __new_clues RENAME TO clues; …`) for `clues`, `solutions`, `hints`, and `mysteries`.

- [ ] **Step 3: Hand-edit the generated `0003_*.sql` to backfill `player_id`**

In the generated SQL, find each child table's `INSERT INTO "__new_clues"(...) SELECT ... FROM "clues";` line. The generated `SELECT` will NOT supply `player_id` (the column is new). Edit each of the three child inserts so `player_id` is selected from the owning mystery's creator. Concretely:

- For **clues**: ensure the `INSERT INTO "__new_clues"(... , "player_id", ...)` column list includes `player_id`, and in the `SELECT`, supply it as:
  ```sql
  (SELECT "player_id" FROM "mysteries" WHERE "mysteries"."id" = "clues"."mystery_id")
  ```
- For **solutions**: same pattern, `… FROM "mysteries" WHERE "mysteries"."id" = "solutions"."mystery_id"`.
- For **hints**: same pattern, `… FROM "mysteries" WHERE "mysteries"."id" = "hints"."mystery_id"`.

Order the statements so the three child-table rebuilds run **before** the `mysteries` rebuild (the backfill reads `mysteries.player_id` while it is still populated). If the generated order puts `mysteries` first, that is still fine — the values are unchanged by the rebuild — but prefer children-first for clarity. Do NOT change the `mysteries` rebuild's data copy (its `player_id` just becomes nullable).

> Note: every existing mystery currently has a non-null `player_id` (it was `NOT NULL` before this migration), so the backfill always finds a creator — no `NOT NULL` violation. If the VM ever holds an orphaned child row, the fallback is to `DELETE FROM clues/solutions/hints WHERE mystery_id NOT IN (SELECT id FROM mysteries)` before the rebuild; add that only if `db:migrate` reports a constraint failure.

- [ ] **Step 4: Apply + verify backfill**

Run: `pnpm --filter @mysterio/server db:migrate`
Expected: applies with no error.

Then verify the columns + backfill with a quick check (only if there is existing data; on a fresh DB this is trivially empty):

Run: `pnpm --filter @mysterio/server exec tsx -e "import {getDb} from './src/db/client.ts'; const d=getDb(); console.log(d.$client.prepare('SELECT count(*) c FROM clues WHERE player_id IS NULL').get(), d.$client.prepare('SELECT count(*) c FROM solutions WHERE player_id IS NULL').get());"`
Expected: both counts `0` (no un-backfilled rows). If `tsx -e` is awkward in this repo, instead open the SQLite file and confirm the columns exist and no child row has a null `player_id`.

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/db/schema.ts apps/server/src/db/migrations/ && git commit -m "M-2a: migration 0003 — per-detective player_id + detective fields + creator nullable"
```

---

### Task 3: In-memory DB test harness + Players routes (TDD)

**Files:**
- Modify: `apps/server/src/db/client.ts` (add a test-injection hook)
- Create: `apps/server/src/test/db.ts` (the harness — reused by Tasks 4–7)
- Modify: `apps/server/src/routes/players.ts`
- Test: `apps/server/src/routes/players.test.ts`

This repo has **no DB-backed tests** today (all server tests are pure-function/mocked). Per-detective isolation is a DB-scoping property, so this task introduces a tiny in-memory SQLite harness that runs the real migrations, then uses it for the first DB-backed route test. Tasks 4–7 reuse `setupTestDb()`.

`GET /players` already returns whole rows, so it includes the new columns once Task 2 lands. Add `POST /players` and `DELETE /players/:id`.

- [ ] **Step 1: Add a test-injection hook to `apps/server/src/db/client.ts`**

After the `getDb()` function (and before/after `getSqlite()`), add:

```ts
/** Test-only: inject an already-migrated DB (see src/test/db.ts). */
export function __setTestDb(
  db: ReturnType<typeof drizzle<typeof schema>>,
  sqlite: Database.Database,
): void {
  _db = db;
  _sqlite = sqlite;
}
```

(`_db`, `_sqlite`, `drizzle`, `schema`, and `Database` are all already in scope in this file.)

- [ ] **Step 2: Create the harness `apps/server/src/test/db.ts`**

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { __setTestDb } from "../db/client.js";
import * as schema from "../db/schema.js";

/** Fresh in-memory SQLite with all migrations applied, injected into getDb(). Call in beforeEach. */
export function setupTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  __setTestDb(db, sqlite);
  return { db, sqlite };
}
```

> `pnpm --filter @mysterio/server test` runs with cwd = `apps/server`, so `./src/db/migrations` resolves the same way `db/migrate.ts` uses it. `migrate()` replays `0000…0003` onto the fresh in-memory DB. Each `beforeEach` builds a brand-new DB, so tests are isolated.

- [ ] **Step 3: Write the failing test** `apps/server/src/routes/players.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();              // fresh in-memory DB with migrations applied
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("players routes", () => {
  it("creates a detective with valid fields and lists it", async () => {
    const res = await app.inject({
      method: "POST", url: "/players",
      payload: { name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().player;
    expect(created.name).toBe("Lily");
    expect(created.age_range).toBe("10-11");
    expect(created.avatar_description).toBe("red hair");

    const list = await app.inject({ method: "GET", url: "/players" });
    expect(list.json().players.some((p: { id: string }) => p.id === created.id)).toBe(true);
  });

  it("trims the name and treats empty avatar_description as null", async () => {
    const res = await app.inject({
      method: "POST", url: "/players",
      payload: { name: "  Sam  ", age_range: "8-9", default_difficulty: "medium", avatar_description: "" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().player.name).toBe("Sam");
    expect(res.json().player.avatar_description).toBeNull();
  });

  it("rejects a bad age_range, empty name, and bad difficulty", async () => {
    for (const payload of [
      { name: "X", age_range: "99-100", default_difficulty: "easy" },
      { name: "   ", age_range: "8-9", default_difficulty: "easy" },
      { name: "X", age_range: "8-9", default_difficulty: "impossible" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/players", payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it("deletes a detective", async () => {
    const created = (await app.inject({
      method: "POST", url: "/players",
      payload: { name: "Gone", age_range: "12-13", default_difficulty: "hard" },
    })).json().player;
    const del = await app.inject({ method: "DELETE", url: `/players/${created.id}` });
    expect(del.statusCode).toBe(204);
    const list = await app.inject({ method: "GET", url: "/players" });
    expect(list.json().players.some((p: { id: string }) => p.id === created.id)).toBe(false);
  });
});
```

(`setupTestDb()` runs the real migrations on a fresh in-memory DB and injects it into `getDb()`, so `playersRoutes` reads/writes a real SQLite. This is the harness Tasks 4–7 reuse.)

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test src/routes/players.test.ts`
Expected: FAIL (POST/DELETE routes 404).

- [ ] **Step 5: Implement `apps/server/src/routes/players.ts`**

```ts
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  name: z.string().trim().min(1).max(24),
  age_range: z.enum(["8-9", "10-11", "12-13"]),
  default_difficulty: z.enum(["easy", "medium", "hard"]),
  avatar_description: z.string().max(300).optional(),
});

export async function playersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/players", async () => {
    const db = getDb();
    const rows = db.select().from(players).all();
    return { players: rows };
  });

  app.post("/players", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const id = shortId();
    const avatar_description = parsed.data.avatar_description?.trim() ? parsed.data.avatar_description.trim() : null;
    db.insert(players).values({
      id,
      name: parsed.data.name,
      age_range: parsed.data.age_range,
      default_difficulty: parsed.data.default_difficulty,
      avatar_description,
    }).run();
    const row = db.select().from(players).where(eq(players.id, id)).get();
    reply.status(201);
    return { player: row };
  });

  app.delete<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const db = getDb();
    db.delete(players).where(eq(players.id, req.params.id)).run();
    reply.status(204);
  });
}
```

> The detective's `created_at` uses the schema default. `name` is stored already-trimmed (zod `.trim()`). Deleting a detective relies on the DB `ON DELETE CASCADE` (clues/solutions/hints) and `ON DELETE SET NULL` (mysteries.player_id) from Task 2. **SQLite foreign keys are already enabled** in `db/client.ts` (`pragma("foreign_keys = ON")`), and `setupTestDb()` sets the same pragma — verified, no change needed.

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/routes/players.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/db/client.ts apps/server/src/test/db.ts apps/server/src/routes/players.ts apps/server/src/routes/players.test.ts && git commit -m "M-2a: in-memory DB test harness + POST/DELETE /players"
```

---

### Task 4: Clues routes — per-detective scoping (TDD)

**Files:**
- Modify: `apps/server/src/routes/clues.ts`
- Test: `apps/server/src/routes/clues.test.ts`

`player_id` is required on writes (POST body) and reads (GET/PATCH/DELETE query). Dedupe + all scoping become per `(mystery_id, player_id)`.

- [ ] **Step 1: Write the failing test** `apps/server/src/routes/clues.test.ts`

In `beforeEach`: call `setupTestDb()` (from `../test/db.js`), register `cluesRoutes` on a fresh `Fastify()` instance, and seed two players `p-a`, `p-b` (with `age_range: "10-11"`, `default_difficulty: "easy"`) and one mystery `m-1` (`player_id: "p-a"`, `category: "missing-pet"`, `difficulty: "easy"`, `status: "ready"`) directly via `getDb().insert(...)`. Assert **per-detective isolation**:

```ts
// Pseudocode-precise — adapt the harness to match the repo's existing route tests.
// beforeEach: insert players p-a, p-b (with age_range '10-11', default_difficulty 'easy');
//             insert mystery m-1 (player_id p-a, category 'missing-pet', difficulty 'easy', status 'ready').

it("scopes clues per detective", async () => {
  // p-a adds a clue
  const a = await app.inject({ method: "POST", url: "/mysteries/m-1/clues",
    payload: { player_id: "p-a", category_type: "note", content: "A's note" } });
  expect(a.statusCode).toBe(201);

  // p-b sees none
  const bList = await app.inject({ method: "GET", url: "/mysteries/m-1/clues?player_id=p-b" });
  expect(bList.json().clues).toHaveLength(0);

  // p-a sees their one
  const aList = await app.inject({ method: "GET", url: "/mysteries/m-1/clues?player_id=p-a" });
  expect(aList.json().clues).toHaveLength(1);
});

it("dedupes annotation clues per detective, so both detectives can add the same annotation", async () => {
  const mk = (player_id: string) => app.inject({ method: "POST", url: "/mysteries/m-1/clues",
    payload: { player_id, category_type: "character", content: "Oliver", source: "annotation", annotation_id: "p-oliver" } });
  expect((await mk("p-a")).statusCode).toBe(201);
  expect((await mk("p-a")).statusCode).toBe(200); // same detective re-tap → existing
  expect((await mk("p-b")).statusCode).toBe(201); // other detective → independent row
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test src/routes/clues.test.ts`
Expected: FAIL (player_id not handled).

- [ ] **Step 3: Rewrite `apps/server/src/routes/clues.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { clues } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  player_id: z.string().min(1),
  category_type: z.enum(["character", "item", "location", "event", "note"]),
  content: z.string().min(1).max(500),
  audio_timestamp_ms: z.number().int().nonnegative().optional(),
  source: z.enum(["manual", "annotation"]).optional(),
  annotation_id: z.string().min(1).max(120).optional(),
}).refine(
  (b) => !(b.source === "annotation") || (typeof b.annotation_id === "string"),
  { message: "annotation_id required when source is 'annotation'" },
);

const patchBody = z.object({
  player_id: z.string().min(1),
  content: z.string().min(1).max(500),
});

const playerQuery = z.object({ player_id: z.string().min(1) });

export async function cluesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const playerId = parsed.data.player_id;
    const source = parsed.data.source ?? "manual";
    const annotation_id = parsed.data.annotation_id ?? null;

    if (source === "annotation" && annotation_id) {
      const existing = db.select().from(clues)
        .where(and(eq(clues.mystery_id, req.params.id), eq(clues.player_id, playerId), eq(clues.annotation_id, annotation_id)))
        .get();
      if (existing) { reply.status(200); return { clue: existing }; }
    }

    const id = shortId();
    db.insert(clues).values({
      id,
      mystery_id: req.params.id,
      player_id: playerId,
      category_type: parsed.data.category_type,
      content: parsed.data.content,
      audio_timestamp_ms: parsed.data.audio_timestamp_ms ?? null,
      source,
      annotation_id,
    }).run();
    const row = db.select().from(clues).where(eq(clues.id, id)).get();
    if (!row) { reply.status(500); return { error: "internal_server_error" }; }
    reply.status(201);
    return { clue: row };
  });

  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = playerQuery.safeParse(req.query);
    if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
    const db = getDb();
    const rows = db.select().from(clues)
      .where(and(eq(clues.mystery_id, req.params.id), eq(clues.player_id, parsed.data.player_id)))
      .all();
    return { clues: rows };
  });

  app.patch<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const where = and(eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id), eq(clues.player_id, parsed.data.player_id));
    db.update(clues).set({ content: parsed.data.content }).where(where).run();
    const row = db.select().from(clues).where(where).get();
    if (!row) { reply.status(404); return { error: "not_found" }; }
    return { clue: row };
  });

  app.delete<{ Params: { id: string; clueId: string }; Querystring: { player_id?: string } }>(
    "/mysteries/:id/clues/:clueId", async (req, reply) => {
      const parsed = playerQuery.safeParse(req.query);
      if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
      const db = getDb();
      db.delete(clues).where(and(
        eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id), eq(clues.player_id, parsed.data.player_id),
      )).run();
      reply.status(204);
    });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/routes/clues.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/routes/clues.ts apps/server/src/routes/clues.test.ts && git commit -m "M-2a: scope clue routes per detective (player_id)"
```

---

### Task 5: Solutions routes — per-detective scoping (TDD)

**Files:**
- Modify: `apps/server/src/routes/solutions.ts`
- Test: `apps/server/src/routes/solutions.test.ts`

Every `solutions`/`hints` query gains `player_id`. `submitSolution`/`give-up` take `player_id` in the body; `solution`, `solve-options` take it in the query. The `solutionResponse` helper takes `(mysteryId, playerId)`.

- [ ] **Step 1: Write the failing test** `apps/server/src/routes/solutions.test.ts`

In `beforeEach`: `setupTestDb()`, register `solutionsRoutes`, seed players `p-a`,`p-b` and a `ready` mystery `m-1` whose `logic_structure_json` is `JSON.stringify(LS_FIXTURE)` (a minimal valid `LogicStructure` — see below). Assert **solve isolation**. The explanation agent calls Claude — **mock it** (place the `vi.mock` at top-of-file, before imports of the route):

```ts
vi.mock("../services/generation/agents/explanationAgent.js", () => ({
  runExplanation: async () => "because reasons",
}));
// ...
it("a solve by p-a does not mark the mystery solved for p-b", async () => {
  const truth = /* ls.true_solution from the seeded logic_structure_json */;
  const a = await app.inject({ method: "POST", url: "/mysteries/m-1/submit-solution",
    payload: { player_id: "p-a", guess_who: truth.who_did_it, guess_how: truth.how, guess_why: truth.why } });
  expect(a.statusCode).toBe(201);

  const aSol = await app.inject({ method: "GET", url: "/mysteries/m-1/solution?player_id=p-a" });
  expect(aSol.json().solution).not.toBeNull();

  const bSol = await app.inject({ method: "GET", url: "/mysteries/m-1/solution?player_id=p-b" });
  expect(bSol.json().solution).toBeNull(); // unsolved for p-b

  // p-b can still fetch solve-options (not blocked by p-a's solve)
  const bOpts = await app.inject({ method: "GET", url: "/mysteries/m-1/solve-options?player_id=p-b" });
  expect(bOpts.statusCode).toBe(200);
});
```

Define `LS_FIXTURE` once at top-of-file — the solve routes only `JSON.parse` and read `true_solution`, `characters`, `how_distractors`, `why_distractors` (no schema/difficulty-count revalidation at solve time), so a minimal object with those fields suffices. **Copy the shape of `makeLogic()` in `apps/server/src/routes/debugView.test.ts`** (one detective `you`, one culprit suspect `theo`, a couple of essential/false clues, `true_solution`, and 3-element `how_distractors`/`why_distractors`). Reference its `true_solution` in the assertions.

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test src/routes/solutions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Edit `apps/server/src/routes/solutions.ts`**

Add a player_id source to each route and thread it into every `solutions`/`hints` query and the helper. Specifically:

Add zod schemas near the top (after `submitBody`):

```ts
const playerQuery = z.object({ player_id: z.string().min(1) });
```

Change `submitBody` to include `player_id`:

```ts
const submitBody = z.object({
  player_id: z.string().min(1),
  guess_who: z.string().min(1),
  guess_how: z.string().min(1).max(400),
  guess_why: z.string().min(1).max(400),
});
```

In `submit-solution`: after parsing, set `const playerId = parsed.data.player_id;`. Change the existing-solution lookup and the hint count to be player-scoped, and add `player_id: playerId` to the inserted solution row:

```ts
    const existing = db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, playerId))).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    // ...
    const hintRow = db.select().from(hints)
      .where(and(eq(hints.mystery_id, myst.id), eq(hints.player_id, playerId))).all();

    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      player_id: playerId,
      // ...unchanged fields...
    }).run();

    reply.status(201);
    return solutionResponse(myst.id, playerId);
```

In `give-up`: read `player_id` from the body (use the same `playerQuery`-style parse on `req.body`, or reuse `submitBody.pick`). Add at the top of the handler:

```ts
    const pid = z.object({ player_id: z.string().min(1) }).safeParse(req.body);
    if (!pid.success) { reply.status(400); return { error: "player_id required" }; }
    const playerId = pid.data.player_id;
```
then make the existing-solution lookup and hint count player-scoped (same `and(... eq(...player_id, playerId))` pattern), add `player_id: playerId` to the inserted row, and `return solutionResponse(myst.id, playerId);`.

In `solution` GET and `solve-options` GET: parse `player_id` from the query via `playerQuery`, 400 if missing, and:
- `solution`: `const r = solutionResponse(req.params.id, parsed.data.player_id);`
- `solve-options`: make the existing-solution lookup player-scoped (`and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, parsed.data.player_id))`).

Update the helper signature + body:

```ts
function solutionResponse(mysteryId: string, playerId: string) {
  const db = getDb();
  const myst = db.select().from(mysteries).where(eq(mysteries.id, mysteryId)).get();
  if (!myst || !myst.logic_structure_json) return null;
  const sol = db.select().from(solutions)
    .where(and(eq(solutions.mystery_id, mysteryId), eq(solutions.player_id, playerId))).get();
  const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
  return {
    solution: sol ?? null,
    true_solution: sol ? ls.true_solution : null,
    characters: ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    explanation: sol?.explanation ?? null,
  };
}
```

Add `and` to the drizzle import: `import { and, eq } from "drizzle-orm";`.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/routes/solutions.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/routes/solutions.ts apps/server/src/routes/solutions.test.ts && git commit -m "M-2a: scope solution routes per detective (player_id)"
```

---

### Task 6: Hints routes — per-detective scoping (TDD)

**Files:**
- Modify: `apps/server/src/routes/hints.ts`
- Test: `apps/server/src/routes/hints.test.ts`

- [ ] **Step 1: Write the failing test** `apps/server/src/routes/hints.test.ts`

In `beforeEach`: `setupTestDb()`, register `hintsRoutes`, seed `p-a`,`p-b` + `ready` mystery `m-1` (with a valid `logic_structure_json`, reuse `LS_FIXTURE` from Task 5). Mock the hint agent at top-of-file (`vi.mock("../services/generation/agents/hintAgent.js", () => ({ runHintAgent: async () => "a hint" }))`). Assert p-a's hints are independent of p-b's and the per-detective limit:

```ts
it("scopes hints per detective and enforces the limit per detective", async () => {
  const ask = (player_id: string) => app.inject({ method: "POST", url: "/mysteries/m-1/hints", payload: { player_id } });
  expect((await ask("p-a")).statusCode).toBe(201);
  expect((await ask("p-a")).statusCode).toBe(201); // 2nd hint
  expect((await ask("p-a")).statusCode).toBe(409); // limit (MAX_HINTS=2) reached for p-a

  // p-b has their own budget
  expect((await ask("p-b")).statusCode).toBe(201);
  const bList = await app.inject({ method: "GET", url: "/mysteries/m-1/hints?player_id=p-b" });
  expect(bList.json().hints).toHaveLength(1);
  expect(bList.json().remaining).toBe(1);
});
```

- [ ] **Step 2: Run it — confirm FAIL.** `pnpm --filter @mysterio/server test src/routes/hints.test.ts`

- [ ] **Step 3: Edit `apps/server/src/routes/hints.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runHintAgent } from "../services/generation/agents/hintAgent.js";
import { shortId } from "../utils/ids.js";

const MAX_HINTS = 2;
const playerQuery = z.object({ player_id: z.string().min(1) });
const playerBody = z.object({ player_id: z.string().min(1) });

export async function hintsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const pid = playerBody.safeParse(req.body);
    if (!pid.success) { reply.status(400); return { error: "player_id required" }; }
    const playerId = pid.data.player_id;
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const sol = db.select().from(solutions)
      .where(and(eq(solutions.mystery_id, myst.id), eq(solutions.player_id, playerId))).get();
    if (sol) { reply.status(409); return { error: "already_solved" }; }
    const prior = db.select().from(hints)
      .where(and(eq(hints.mystery_id, myst.id), eq(hints.player_id, playerId))).all();
    if (prior.length >= MAX_HINTS) { reply.status(409); return { error: "hint_limit_reached", limit: MAX_HINTS }; }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const content = await runHintAgent({ logicStructure: ls, priorHints: prior.map((h) => h.content) });

    const id = shortId();
    db.insert(hints).values({ id, mystery_id: myst.id, player_id: playerId, content }).run();
    const row = db.select().from(hints).where(eq(hints.id, id)).get();
    reply.status(201);
    return { hint: row, remaining: MAX_HINTS - (prior.length + 1) };
  });

  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const parsed = playerQuery.safeParse(req.query);
    if (!parsed.success) { reply.status(400); return { error: "player_id required" }; }
    const db = getDb();
    const rows = db.select().from(hints)
      .where(and(eq(hints.mystery_id, req.params.id), eq(hints.player_id, parsed.data.player_id))).all();
    return { hints: rows, remaining: Math.max(0, MAX_HINTS - rows.length) };
  });
}
```

- [ ] **Step 4: Run the test — confirm PASS.** `pnpm --filter @mysterio/server test src/routes/hints.test.ts`

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/routes/hints.ts apps/server/src/routes/hints.test.ts && git commit -m "M-2a: scope hint routes per detective (player_id)"
```

---

### Task 7: Mysteries list — shared ready pool + per-detective status (TDD)

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts` (the `GET /mysteries` handler, lines ~137-163)
- Test: `apps/server/src/routes/mysteriesList.test.ts`

New behavior: `GET /mysteries?player_id=X` returns **all `ready` stories** (regardless of creator) **plus** the requesting detective's own non-`ready` stories, each annotated with `solved`/`started` for detective X.

- [ ] **Step 1: Write the failing test** `apps/server/src/routes/mysteriesList.test.ts`

In `beforeEach`: `setupTestDb()`, register `mysteriesRoutes`, seed `p-a`,`p-b`; a `ready` mystery `m-ready` (`player_id: "p-a"`); a `pending` mystery `m-pending` (`player_id: "p-a"`). Assert:

```ts
it("shows ready stories to everyone and non-ready only to the creator, with per-detective status", async () => {
  // p-b (not the creator) sees the ready story but NOT p-a's pending one
  const bList = (await app.inject({ method: "GET", url: "/mysteries?player_id=p-b" })).json().mysteries;
  expect(bList.map((m: { id: string }) => m.id)).toContain("m-ready");
  expect(bList.map((m: { id: string }) => m.id)).not.toContain("m-pending");

  // p-a (creator) sees their pending one too
  const aList = (await app.inject({ method: "GET", url: "/mysteries?player_id=p-a" })).json().mysteries;
  expect(aList.map((m: { id: string }) => m.id)).toContain("m-pending");

  // status is per-detective: insert a correct solution for p-a on m-ready, p-b still sees solved=false
  // (insert a solutions row {mystery_id:'m-ready', player_id:'p-a', is_correct:1, ...} via getDb())
  const aReady = aList.find((m: { id: string }) => m.id === "m-ready");
  // after inserting p-a's solution and re-fetching:
  // expect(aReadyAfter.solved).toBe(true); expect(bReady.solved).toBe(false);
});
```

(Complete the solved-isolation assertion by inserting a `solutions` row for `p-a` and re-fetching both lists; assert `solved` differs.)

- [ ] **Step 2: Run it — confirm FAIL.** `pnpm --filter @mysterio/server test src/routes/mysteriesList.test.ts`

- [ ] **Step 3: Replace the `GET /mysteries` handler** in `apps/server/src/routes/mysteries.ts`

```ts
  app.get<{ Querystring: { player_id?: string; limit?: string } }>("/mysteries", async (req, reply) => {
    const playerId = req.query.player_id;
    if (!playerId) {
      reply.status(400);
      return { error: "player_id required" };
    }
    const limit = Math.max(1, Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50));
    const db = getDb();
    const rows = db.select({
      id: mysteries.id,
      player_id: mysteries.player_id,
      category: mysteries.category,
      difficulty: mysteries.difficulty,
      status: mysteries.status,
      title: mysteries.title,
      created_at: mysteries.created_at,
      ready_at: mysteries.ready_at,
      solved: sql<number>`EXISTS (SELECT 1 FROM solutions s WHERE s.mystery_id = ${mysteries.id} AND s.player_id = ${playerId} AND s.is_correct = 1)`,
      started: sql<number>`(EXISTS (SELECT 1 FROM solutions s WHERE s.mystery_id = ${mysteries.id} AND s.player_id = ${playerId}) OR EXISTS (SELECT 1 FROM clues c WHERE c.mystery_id = ${mysteries.id} AND c.player_id = ${playerId}))`,
    }).from(mysteries)
      // shared pool: every ready story, plus THIS detective's own non-ready stories
      .where(sql`${mysteries.status} = 'ready' OR ${mysteries.player_id} = ${playerId}`)
      .orderBy(desc(mysteries.created_at))
      .limit(limit)
      .all();
    return {
      mysteries: rows.map((r) => ({ ...r, solved: r.solved === 1, started: r.started === 1 })),
    };
  });
```

- [ ] **Step 4: Run the test — confirm PASS.** `pnpm --filter @mysterio/server test src/routes/mysteriesList.test.ts`

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/routes/mysteries.ts apps/server/src/routes/mysteriesList.test.ts && git commit -m "M-2a: shared ready-pool mystery list + per-detective solved/started"
```

---

### Task 8: Detective-agnostic generation (TDD on prompt)

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/routes/mysteries.ts` (the `POST /mysteries/generate` handler)

- [ ] **Step 1: Update the prompt test** `logicStructure.system.test.ts`

Add a test asserting the system prompt makes the detective second-person and does NOT demand a player-provided name:

```ts
it("describes a detective-agnostic second-person detective", () => {
  const s = buildLogicStructureSystem("easy");
  expect(s).toContain('"You"');                 // detective is named "You"
  expect(s.toLowerCase()).toContain("second person");
  expect(s).not.toContain("name provided in the user message");
});
```

Keep the existing tests; if any existing test asserted the old "name MUST match" rule, update it to the new behavior.

- [ ] **Step 2: Run it — confirm FAIL.** `pnpm --filter @mysterio/server test src/services/generation/prompts/logicStructure.system.test.ts`

- [ ] **Step 3: Edit the DETECTIVE CHARACTER rule** in `logicStructure.system.ts` (line ~56). Replace that bullet with:

```ts
- DETECTIVE CHARACTER: exactly one character has role "detective" and their "name" MUST be exactly "You". Write their description in the second person ("You are the detective on this case — curious, observant, you carry a notebook everywhere"). The detective is the listener's stand-in and is NEVER the culprit. Do not give the detective a personal first name; any detective should be able to solve this story.
```

(The CLUE OBFUSCATION note at line ~66 that says "You may name the detective character freely" still works — the detective's name is literally "You".)

- [ ] **Step 4: Drop `playerName` from the agent** `logicStructureAgent.ts`

- Remove `playerName: string;` from `LogicStructureAgentInput`.
- In `buildUserMessage`, change `base` to:

```ts
  const base = `Generate a ${input.difficulty} ${input.category} mystery.`;
```

(Delete the M5a `NOTE:` comment about interpolating `player.name`.)

- [ ] **Step 5: Drop the player fetch from the orchestrator** `orchestrator.ts`

- Remove `playerName` from the `RunInput` interface (the `playerName: string;` line).
- Remove `playerName: input.playerName,` from the `runLogicStructureAgent({ ... })` call.

- [ ] **Step 6: Update `POST /mysteries/generate`** in `mysteries.ts`

The handler still validates the creator exists, but no longer passes a name. Change the `void runGeneration({...})` call to drop `playerName`:

```ts
    void runGeneration({
      mysteryId: id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
    });
```

(Keep the `player` existence check + the `player_id` on the inserted row as the creator.)

- [ ] **Step 7: Verify + full server tests**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS (the prompt test now passes; nothing else references `playerName`).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts apps/server/src/services/generation/prompts/logicStructure.system.test.ts apps/server/src/services/generation/agents/logicStructureAgent.ts apps/server/src/services/generation/orchestrator.ts apps/server/src/routes/mysteries.ts && git commit -m "M-2a: detective-agnostic generation (second-person 'You'; drop playerName)"
```

---

### Task 9: Web API layer — thread player_id + create/delete detective

**Files:**
- Modify: `apps/web/src/api/players.ts`
- Modify: `apps/web/src/api/clues.ts`
- Modify: `apps/web/src/api/hints.ts`
- Modify: `apps/web/src/api/solutions.ts`
- Modify: `apps/web/src/api/solveOptions.ts`

- [ ] **Step 1: `players.ts` — add create + delete**

```ts
import type { AgeRange, DifficultyId, Player } from "@mysterio/shared";
import { api } from "./client.js";

export function listPlayers(): Promise<{ players: Player[] }> {
  return api("/api/players");
}

export function createPlayer(body: {
  name: string;
  age_range: AgeRange;
  default_difficulty: DifficultyId;
  avatar_description?: string;
}): Promise<{ player: Player }> {
  return api("/api/players", { method: "POST", body: JSON.stringify(body) });
}

export function deletePlayer(id: string): Promise<void> {
  return api(`/api/players/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 2: `clues.ts` — every function takes `playerId`**

```ts
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
```

- [ ] **Step 3: `hints.ts`**

```ts
import type { Hint } from "@mysterio/shared";
import { api } from "./client.js";

export function listHints(mysteryId: string, playerId: string): Promise<{ hints: Hint[]; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints?player_id=${encodeURIComponent(playerId)}`);
}

export function requestHint(mysteryId: string, playerId: string): Promise<{ hint: Hint; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`, { method: "POST", body: JSON.stringify({ player_id: playerId }) });
}
```

- [ ] **Step 4: `solutions.ts`**

```ts
export function submitSolution(
  mysteryId: string,
  playerId: string,
  body: { guess_who: string; guess_how: string; guess_why: string },
): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/submit-solution`, {
    method: "POST",
    body: JSON.stringify({ player_id: playerId, ...body }),
  });
}

export function giveUp(mysteryId: string, playerId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/give-up`, { method: "POST", body: JSON.stringify({ player_id: playerId }) });
}

export function getSolution(mysteryId: string, playerId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/solution?player_id=${encodeURIComponent(playerId)}`);
}
```

(Keep the imports + `SolutionResponse` interface unchanged.)

- [ ] **Step 5: `solveOptions.ts`**

```ts
export function getSolveOptions(mysteryId: string, playerId: string): Promise<SolveOptions> {
  return api(`/api/mysteries/${mysteryId}/solve-options?player_id=${encodeURIComponent(playerId)}`);
}
```

- [ ] **Step 6: Commit** (typecheck will fail until call sites are updated in Tasks 11–13 — that's expected; commit the api layer now so the diff is reviewable, and do NOT run the web typecheck gate yet)

```bash
git add apps/web/src/api/players.ts apps/web/src/api/clues.ts apps/web/src/api/hints.ts apps/web/src/api/solutions.ts apps/web/src/api/solveOptions.ts && git commit -m "M-2a: web api — thread player_id + createPlayer/deletePlayer"
```

> Tasks 10-13 update the call sites; the web typecheck/build gate is run green at the end of Task 13.

---

### Task 10: Player store — validate the active detective on load

**Files:**
- Modify: `apps/web/src/state/playerStore.ts`

No interface change is needed (it already exposes `activePlayerId`, `setActivePlayer`, `clear`). The validation happens where the store is consumed (the app shell / PlayerPicker gate in Task 11). This task only adds a tiny helper used there.

- [ ] **Step 1: Add a `setActivePlayer`-compatible no-op confirm** — actually no store change is required. Skip code changes here and fold the "validate stored id against `GET /players`, clear if missing" logic into Task 11 (the PlayerPicker/app-gate), where `listPlayers` is already queried. Mark this task complete with no commit.

> Rationale: the store is already sufficient; validating the persisted id belongs in the component that loads the player list (Task 11). Keeping the store dumb avoids a network call inside zustand. No commit for Task 10.

---

### Task 11: PlayerPicker — create entry + delete (edit mode)

**Files:**
- Modify: `apps/web/src/screens/PlayerPicker.tsx`

- [ ] **Step 1: Read the full current `PlayerPicker.tsx`** to preserve its casebook styling, then make these changes:

1. Import the mutations + store cleanup:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletePlayer } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
```
2. Add local `const [editing, setEditing] = useState(false);` and `const qc = useQueryClient();` and `const clear = usePlayerStore((s) => s.clear);` and the active id `const activePlayerId = usePlayerStore((s) => s.activePlayerId);`.
3. **Validate the persisted active id:** in an effect after `data` loads, if `activePlayerId` is set but not present in `data.players`, call `clear()`:
```tsx
useEffect(() => {
  if (data && activePlayerId && !data.players.some((p) => p.id === activePlayerId)) clear();
}, [data, activePlayerId, clear]);
```
4. Add a **delete mutation**:
```tsx
const delM = useMutation({
  mutationFn: (id: string) => deletePlayer(id),
  onSuccess: (_d, id) => {
    if (activePlayerId === id) clear();
    void qc.invalidateQueries({ queryKey: ["players"] });
  },
});
```
5. Render an **"Edit" toggle** (text button) next to the "Detectives" `Kicker` that flips `editing`. When `editing`, render a small trash `<button aria-label={`Delete ${p.name}`}>` on each detective card that calls `window.confirm(`Delete detective ${p.name}? Their notes and solved mysteries are removed.`)` then `delM.mutate(p.id)`. Keep selection (`setActivePlayer`) disabled while `editing` (so a delete-tap doesn't also select).
6. Add a **"➕ New detective"** card at the end of the list that navigates to the create route (Task 12): use the app's router. Inspect how `PlayerPicker` currently transitions (it calls `setActivePlayer` to advance; the routing is in `apps/web/src/routes.tsx`). Add a `<button>` that sets a local `creating` state OR navigates to a `/new-detective` route — whichever matches the existing routing approach in `routes.tsx`. (If routing is state-based via `activePlayerId`, render the `CreateDetective` component inline when `creating` is true.)

> Keep all inline styles consistent with the existing casebook look (reuse the existing card styles; the trash button is a small ghost button).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/screens/PlayerPicker.tsx && git commit -m "M-2a: PlayerPicker — delete detectives + new-detective entry + stale-id cleanup"
```

---

### Task 12: Create-detective form

**Files:**
- Create: `apps/web/src/screens/CreateDetective.tsx`
- Modify: `apps/web/src/routes.tsx` (wire the new screen per the existing routing approach)

- [ ] **Step 1: Create `apps/web/src/screens/CreateDetective.tsx`**

A form with Name (text input, maxLength 24), Age range (three buttons or a select over `AGE_RANGES`), Avatar description (textarea, maxLength 300, with placeholder "Describe your detective! e.g. a kid with curly red hair, a green coat, and a magnifying glass"), and Difficulty (Easy/Medium/Hard). On submit, call `createPlayer`, then `setActivePlayer(created.player.id)` and return to the main flow.

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGE_RANGES, type AgeRange, type DifficultyId } from "@mysterio/shared";
import { createPlayer } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
import { Kicker } from "../components/casebook/index.js";

const DIFFICULTIES: DifficultyId[] = ["easy", "medium", "hard"];

export function CreateDetective({ onCancel }: { onCancel: () => void }) {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("10-11");
  const [difficulty, setDifficulty] = useState<DifficultyId>("easy");
  const [avatar, setAvatar] = useState("");

  const createM = useMutation({
    mutationFn: () => createPlayer({
      name: name.trim(),
      age_range: ageRange,
      default_difficulty: difficulty,
      avatar_description: avatar.trim() || undefined,
    }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["players"] });
      setActivePlayer(res.player.id);
    },
  });

  const valid = name.trim().length >= 1 && name.trim().length <= 24;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <Kicker>Create your detective</Kicker>
        <label style={{ display: "block", margin: "12px 0 4px" }}>Name</label>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lily" style={{ width: "100%", padding: 12 }} />

        <label style={{ display: "block", margin: "16px 0 4px" }}>Age</label>
        <div style={{ display: "flex", gap: 8 }}>
          {AGE_RANGES.map((r) => (
            <button key={r} onClick={() => setAgeRange(r)} aria-pressed={ageRange === r}
              style={{ flex: 1, padding: 12, fontWeight: ageRange === r ? 700 : 400 }}>{r}</button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>Difficulty</label>
        <div style={{ display: "flex", gap: 8 }}>
          {DIFFICULTIES.map((d) => (
            <button key={d} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}
              style={{ flex: 1, padding: 12, textTransform: "capitalize", fontWeight: difficulty === d ? 700 : 400 }}>{d}</button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>Describe your detective (optional)</label>
        <textarea value={avatar} maxLength={300} onChange={(e) => setAvatar(e.target.value)} rows={3}
          placeholder="e.g. a kid with curly red hair, a green coat, and a magnifying glass"
          style={{ width: "100%", padding: 12 }} />

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 14 }}>Cancel</button>
          <button onClick={() => createM.mutate()} disabled={!valid || createM.isPending}
            style={{ flex: 2, padding: 14, fontWeight: 700 }}>
            {createM.isPending ? "Creating..." : "Start detecting →"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `routes.tsx`** per the existing approach. If routing is state-based (PlayerPicker shows when no active player), the simplest integration is: PlayerPicker holds a `creating` boolean (from Task 11) and renders `<CreateDetective onCancel={() => setCreating(false)} />` when true. In that case this step adds the import + conditional render inside PlayerPicker rather than a new route. Match whatever `routes.tsx` already does — read it first.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/CreateDetective.tsx apps/web/src/routes.tsx apps/web/src/screens/PlayerPicker.tsx && git commit -m "M-2a: create-detective form"
```

---

### Task 13: Thread active detective into note/hint/solve call sites + green web gate

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/ClueSummary.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/HintControls.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`

Every call to the api functions changed in Task 9 must now pass the active detective id. Read it from the store in each component: `const playerId = usePlayerStore((s) => s.activePlayerId);` and guard (these screens only render with an active detective; if `playerId` is null, render nothing / a redirect — match how the screen already handles a missing player).

- [ ] **Step 1: `ClueTracker.tsx`** — add `const playerId = usePlayerStore((s) => s.activePlayerId)!;` (import `usePlayerStore`). Update the four calls:
  - `listClues(mysteryId)` → `listClues(mysteryId, playerId)` (also add `playerId` to the query key: `["clues", mysteryId, playerId]`).
  - `createClue(mysteryId, {...})` → `createClue(mysteryId, playerId, {...})`.
  - `updateClue(mysteryId, clueId, content)` → `updateClue(mysteryId, playerId, clueId, content)`.
  - `deleteClue(mysteryId, clueId)` → `deleteClue(mysteryId, playerId, clueId)`.

- [ ] **Step 2: `PlaybackScreen.tsx`** — add `const playerId = usePlayerStore((s) => s.activePlayerId)!;` (if not already reading the store) and change the annotation-tap `createClue(mysteryId, {...})` (line ~44) → `createClue(mysteryId, playerId, {...})`.

- [ ] **Step 3: `ClueSummary.tsx`** — add the store read and change `listClues(mysteryId)` → `listClues(mysteryId, playerId)` (and query key `["clues", mysteryId, playerId]`).

- [ ] **Step 4: `HintControls.tsx`** — add the store read and update: `listHints(mysteryId)` → `listHints(mysteryId, playerId)` (key `["hints", mysteryId, playerId]`); `requestHint(mysteryId)` → `requestHint(mysteryId, playerId)`; `giveUp(mysteryId)` → `giveUp(mysteryId, playerId)`.

- [ ] **Step 5: `SolutionScreen.tsx`** — add the store read and update: `getSolution(mysteryId)` → `getSolution(mysteryId, playerId)` (key `["solution", mysteryId, playerId]`); `getSolveOptions(mysteryId)` → `getSolveOptions(mysteryId, playerId)`; `submitSolution(mysteryId, g)` → `submitSolution(mysteryId, playerId, g)`. Leave `getMystery(mysteryId)` unchanged (shared content).

- [ ] **Step 6: Green the web gate**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS (all call sites now match the Task-9 signatures). Fix any remaining signature mismatches the typecheck surfaces.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/screens && git commit -m "M-2a: thread active detective id into note/hint/solve call sites"
```

---

### Task 14: MainScreen — shared pool + solved badge

**Files:**
- Modify: `apps/web/src/screens/MainScreen/RecentList.tsx` (and `MainScreen.tsx` only if needed)

The list endpoint already returns the shared pool + per-detective `solved`/`started` (Task 7), and `RecentList` already calls `listMysteries(playerId, 10)`. The remaining work is presentational.

- [ ] **Step 1: Read `RecentList.tsx`** and add a per-item status badge: show **"Solved ✓"** when `m.solved`, else **"New"** (or **"In progress"** when `m.started && !m.solved`). Use the existing casebook `Chip`/`Stamp` primitives if present (`apps/web/src/components/casebook/index.ts`). The `MysterySummary` type now includes `solved` + `started` (Task 1), so no api change is needed.

- [ ] **Step 2: Web gate**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/MainScreen && git commit -m "M-2a: shared-pool story list with per-detective solved/new badge"
```

---

### Task 15: Verification + boot smoke

**Files:** none (verification only)

- [ ] **Step 1: Full server gate**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS, including the new `players`, `clues`, `solutions`, `hints`, and `mysteriesList` suites, and the updated `logicStructure.system` prompt test. No test calls a live LLM (explanation + hint agents are mocked).

- [ ] **Step 2: Full web gate**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 3: Boot smoke (catches runtime FK/migration issues typecheck can't)**

Boot the server against a scratch DB and exercise the per-detective isolation end-to-end with `curl`: create two detectives, generate is not needed — insert a `ready` mystery via the DB or reuse one — then confirm `GET /mysteries?player_id=A` vs `?player_id=B` show the same ready story, and that a clue POSTed by A is absent from B's `GET …/clues?player_id=B`. Confirm `DELETE /players/:id` returns 204 and the detective disappears from `GET /players`. Confirm **delete-cascade works** (delete a detective who has clues and verify the clue rows are gone). FK enforcement is already ON in `db/client.ts` (verified) — this step confirms it end-to-end at runtime.

- [ ] **Step 4: Confirm no live LLM in CI tests**

Run: `grep -rn "runExplanation\|runHintAgent\|claudeText" apps/server/src/routes/*.test.ts`
Confirm every solve/hint test mocks the agent (no live Claude call in the per-PR suite).

---

## Self-Review (completed by plan author)

- **Spec coverage:** §1 data model → Task 2 (+ Task 1 shared types). §2 detective-agnostic generation → Task 8. §3 API: players create/delete → Task 3; shared `ready` pool + per-detective status + non-ready-to-creator → Task 7; per-detective clues/solve/hints → Tasks 4/5/6; web api → Task 9. §4 frontend: PlayerPicker create/delete + stale-id validation → Task 11; create form → Task 12; call-site threading → Task 13; shared list + badge → Task 14. Testing (per-detective isolation, delete cascade, validation, prompt-no-name) → Tasks 3-8, 15. The spec's note that `GET /mysteries/:id` is "scoped per detective" is implemented as: the shared detail endpoint is unchanged, and the per-detective data (clues/hints/solution) comes from the separately-scoped sub-resource endpoints — equivalent, and called out in Task 13. Future items (Postgres, model split, auth) are deferred, not in any task.
- **Placeholder scan:** server tasks carry complete test + impl code. Frontend Tasks 11-14 give exact edits but require reading the current component first (their internals — routing style, existing styles — vary); each names the precise calls/props to change. This is intentional (the components carry casebook styling that must be preserved) and is not a code placeholder for new logic.
- **Type consistency:** `age_range`/`AgeRange` (Tasks 1,2,3,9,12), `player_id` added consistently to clues/solutions/hints (Tasks 2,4,5,6) and threaded as `playerId` param in the web api (Task 9) and call sites (Task 13). `MysterySummary.solved/started` (Task 1) ↔ `GET /mysteries` projection (Task 7) ↔ badge (Task 14). `createPlayer`/`deletePlayer` (Task 9) ↔ routes (Task 3) ↔ UI (Tasks 11,12).
- **Migration risk:** Task 2 is the one place reality may diverge from the generated SQL; it has explicit inspect-and-backfill steps + a verification query + a documented fallback.
- **FK enforcement:** the delete-cascade depends on `PRAGMA foreign_keys = ON` — **verified already present** in `db/client.ts`, and `setupTestDb()` sets it too.
- **Test harness:** Task 3 introduces the repo's first DB-backed test harness (`src/test/db.ts` + a `__setTestDb` hook), since per-detective isolation can only be asserted against a real DB. Tasks 4–7 reuse it. Solve/hint tests mock the Claude-backed agents (no live LLM in CI).
