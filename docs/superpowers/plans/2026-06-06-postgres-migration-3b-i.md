# Spec 3b-i — SQLite → Postgres Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace better-sqlite3/drizzle-sqlite with Postgres (`pg` + drizzle-pg) across `apps/server`, run gate-green against a local docker-compose Postgres. No production data is touched; the live app stays on SQLite until 3b-ii.

**Architecture:** Swap the driver (sync → **async** drizzle calls everywhere), re-author the schema as `pgTable` with real `boolean`/`timestamptz`/`jsonb`, squash the six SQLite migrations into one generated Postgres baseline, drop the FK-off migrate dance, back tests with **pg-mem**, and update the DTO contract (timestamps become ISO strings; solution booleans become real booleans) in `packages/shared` + `apps/web`.

**Tech Stack:** TypeScript, Drizzle ORM (`drizzle-orm/node-postgres`), node-postgres (`pg`), pg-mem, drizzle-kit, Vitest, Fastify, React/Vite, Docker Compose.

---

## ⚠️ Read first: this is a "big-bang" driver swap

better-sqlite3 is **synchronous** and uses `.get()` / `.all()` / `.run()` terminators. drizzle-pg is **async** and has **none of those methods** — you `await` the query builder directly. So this is a real rewrite, not just sprinkling `await`.

**Once Task 2 (schema → pgTable) and Task 3 (client → pg) land, the whole server is type-broken until every call site is converted.** Project-wide `tsc` will be RED in the middle of this plan — that is expected. We keep progress verifiable two ways:

1. **Vitest runs per-file via esbuild** (no project-wide type-check), so a single converted route + its converted test file go green independently of the still-broken sibling routes. Each conversion task runs **only its own test file** and commits.
2. The **final task** runs the full `tsc` typecheck + full vitest suite + web build + a docker-compose-Postgres smoke. Everything is green only there.

### The mechanical conversion rules (apply in every Task 5–9 file)

| SQLite (better-sqlite3, sync) | Postgres (drizzle-pg, async) |
|---|---|
| `const row = db.select()…where(…).get();` | `const [row] = await db.select()…where(…).limit(1);` |
| `const rows = db.select()…all();` | `const rows = await db.select()…;` |
| `db.insert(t).values(v).run();` | `await db.insert(t).values(v);` |
| `db.update(t).set(s).where(w).run();` | `await db.update(t).set(s).where(w);` |
| `db.delete(t).where(w).run();` | `await db.delete(t).where(w);` |
| `db.insert(t).values(v).onConflictDoNothing().run();` | `await db.insert(t).values(v).onConflictDoNothing();` |
| `result.changes` (from `.run()`) | use `.returning({ id: t.id })` and read `.length` |
| insert/compare `is_correct: x ? 1 : 0` | `is_correct: x` (real boolean) |
| read `row.is_correct === 1` | `row.is_correct` (already boolean) |
| query `eq(t.bool_col, 1)` | `eq(t.bool_col, true)` |
| raw SQL `col = 1` (boolean col) | raw SQL `col = true` |
| `JSON.parse(row.jsonb_col)` | `row.jsonb_col` (drizzle returns the object) |
| write `col: JSON.stringify(obj)` | `col: obj` |
| `Math.floor(Date.now()/1000)` for a timestamp col | `new Date()` |
| a `Date` timestamp returned to web is auto-serialized to an **ISO string** | update consumers from `number` → `string` |

**Keep as integers (NOT booleans):** `hints_used`, `validation_attempts`, `audio_timestamp_ms`. These are real counts/offsets, not flags.

---

## File Structure

**Modified — server config/infra:**
- `apps/server/package.json` — deps swap
- `apps/server/src/config/env.ts` — `DATABASE_PATH` → `DATABASE_URL`
- `apps/server/drizzle.config.ts` — `dialect: "postgresql"`
- `apps/server/src/db/schema.ts` — `pgTable` + boolean/timestamptz/jsonb
- `apps/server/src/db/client.ts` — `pg.Pool` + drizzle-pg; remove `getSqlite`
- `apps/server/src/db/migrate.ts` — plain `migrate()`, no FK dance
- `apps/server/src/test/db.ts` — pg-mem harness

**Modified — server consumers (async + boolean/jsonb/timestamp):**
- `apps/server/src/routes/players.ts`, `mysteries.ts`, `solutions.ts`, `hints.ts`, `clues.ts`, `health.ts`, `debugView.ts`
- `apps/server/src/services/generation/orchestrator.ts`
- `apps/server/src/startup.ts`, `apps/server/src/index.ts`
- All `apps/server/src/routes/*.test.ts` that seed the DB

**Modified — DTO contract:**
- `packages/shared/src/types/mystery.ts`, `solution.ts`, `clue.ts`, `hint.ts`
- `apps/web/src/api/mysteries.ts`, `apps/web/src/api/players.ts`
- `apps/web/src/screens/TrophyRoom/TrophyRoom.tsx`

**Created:**
- `docker-compose.yml` (repo root)
- `apps/server/.env.example` (or update existing)
- one new `apps/server/src/db/migrations/0000_*.sql` (generated, replaces all old ones)

**Deleted:**
- `apps/server/src/db/migrations/0000–0005*.sql` + `migrations/meta/`
- `apps/server/src/db/migration_target_age_range.test.ts`
- `apps/server/src/db/migration_avatar_image_path.test.ts`

---

## Task 1: Dependencies, env, docker-compose, drizzle config

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/config/env.ts`
- Modify: `apps/server/drizzle.config.ts`
- Create: `docker-compose.yml`
- Create: `apps/server/.env.example`

- [ ] **Step 1: Swap server deps**

In `apps/server/package.json`, remove `better-sqlite3` and `@types/better-sqlite3`; add `pg`, `@types/pg`, and `pg-mem`:

```jsonc
// dependencies:
"drizzle-orm": "^0.36.0",
"pg": "^8.13.1",
// remove "better-sqlite3": "^11.5.0",

// devDependencies:
"@types/pg": "^8.11.10",
"pg-mem": "^3.0.5",
// remove "@types/better-sqlite3": "^7.6.11",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates; `pg`, `@types/pg`, `pg-mem` resolved; no better-sqlite3.

- [ ] **Step 3: env — `DATABASE_PATH` → `DATABASE_URL`**

In `apps/server/src/config/env.ts`, replace the `DATABASE_PATH` line:

```ts
DATABASE_URL: z.string().min(1).default("postgresql://mysterio:mysterio@localhost:5432/mysterio"),
```

(Remove `DATABASE_PATH` entirely. `AUDIO_DIR`/`IMAGE_DIR`/everything else unchanged.)

- [ ] **Step 4: drizzle.config.ts → postgresql**

Replace the whole file:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://mysterio:mysterio@localhost:5432/mysterio",
  },
});
```

- [ ] **Step 5: docker-compose.yml (repo root)**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: mysterio-pg
    environment:
      POSTGRES_USER: mysterio
      POSTGRES_PASSWORD: mysterio
      POSTGRES_DB: mysterio
    ports:
      - "5432:5432"
    volumes:
      - mysterio-pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mysterio"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  mysterio-pg-data:
```

- [ ] **Step 6: .env.example**

Create/update `apps/server/.env.example` with (at least):

```
DATABASE_URL=postgresql://mysterio:mysterio@localhost:5432/mysterio
```

Document in the file header: `docker compose up -d` before `pnpm dev` / `pnpm --filter @mysterio/server db:migrate`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json apps/server/src/config/env.ts apps/server/drizzle.config.ts docker-compose.yml apps/server/.env.example pnpm-lock.yaml
git commit -m "3b-i: swap deps to pg + pg-mem, DATABASE_URL, docker-compose Postgres"
```

---

## Task 2: Schema → pgTable (boolean / timestamptz / jsonb)

**Files:**
- Modify: `apps/server/src/db/schema.ts`

- [ ] **Step 1: Rewrite schema.ts as pgTable**

Replace the entire file. Preserve every table/column name, PK, index, unique index, and CHECK. Convert types per the rules. Note the `$type<>()` imports come from `@mysterio/shared`.

```ts
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  default_difficulty: text("default_difficulty").notNull(),
  age_range: text("age_range").notNull().default("10-11"),
  avatar_description: text("avatar_description"),
  avatar_image_path: text("avatar_image_path"),
  created_at: createdAt(),
}, (t) => ({
  difficultyCheck: check("players_difficulty_chk", sql`${t.default_difficulty} IN ('easy','medium','hard')`),
  ageRangeCheck: check("players_age_range_chk", sql`${t.age_range} IN ('8-9','10-11','12-13')`),
}));

export const mysteries = pgTable("mysteries", {
  id: text("id").primaryKey(),
  player_id: text("player_id").references(() => players.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  target_age_range: text("target_age_range"),
  status: text("status").notNull(),
  title: text("title"),
  logic_structure_json: jsonb("logic_structure_json").$type<LogicStructure>(),
  narrative_text: text("narrative_text"),
  narrative_annotations: jsonb("narrative_annotations").$type<NarrativeAnnotation[]>(),
  audio_path: text("audio_path"),
  cover_image_path: text("cover_image_path"),
  validation_passed: boolean("validation_passed"),
  validation_attempts: integer("validation_attempts").notNull().default(0),
  validation_notes: text("validation_notes"),
  failure_reason: text("failure_reason"),
  created_at: createdAt(),
  ready_at: timestamp("ready_at", { withTimezone: true }),
}, (t) => ({
  difficultyCheck: check("mysteries_difficulty_chk", sql`${t.difficulty} IN ('easy','medium','hard')`),
  statusCheck: check(
    "mysteries_status_chk",
    sql`${t.status} IN ('pending','generating_logic','validating','writing','synthesizing','ready','failed')`,
  ),
  playerIdx: index("idx_mysteries_player").on(t.player_id, t.created_at),
  activeIdx: index("idx_mysteries_active").on(t.status),
}));

export const clues = pgTable("clues", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  category_type: text("category_type").notNull(),
  content: text("content").notNull(),
  audio_timestamp_ms: integer("audio_timestamp_ms"),
  source: text("source").notNull().default("manual"),
  annotation_id: text("annotation_id"),
  created_at: createdAt(),
}, (t) => ({
  categoryCheck: check("clues_category_chk", sql`${t.category_type} IN ('character','item','location','event','note')`),
  sourceCheck: check("clues_source_chk", sql`${t.source} IN ('manual','annotation')`),
  mysteryIdx: index("idx_clues_mystery").on(t.mystery_id),
  annotationUniq: uniqueIndex("clues_mystery_annotation_uniq")
    .on(t.mystery_id, t.player_id, t.annotation_id)
    .where(sql`${t.annotation_id} IS NOT NULL`),
  mysteryPlayerIdx: index("idx_clues_mystery_player").on(t.mystery_id, t.player_id),
}));

export const solutions = pgTable("solutions", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  guess_who: text("guess_who"),
  guess_how: text("guess_how"),
  guess_why: text("guess_why"),
  is_correct: boolean("is_correct").notNull(),
  who_match: boolean("who_match"),
  how_match: boolean("how_match"),
  why_match: boolean("why_match"),
  hints_used: integer("hints_used").notNull().default(0),
  gave_up: boolean("gave_up").notNull().default(false),
  explanation: text("explanation"),
  created_at: createdAt(),
}, (t) => ({
  mysteryUniq: uniqueIndex("solutions_mystery_uniq").on(t.mystery_id, t.player_id),
}));

export const hints = pgTable("hints", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  created_at: createdAt(),
}, (t) => ({
  mysteryPlayerIdx: index("idx_hints_mystery_player").on(t.mystery_id, t.player_id),
}));
```

- [ ] **Step 2: Verify schema.ts itself parses (file-scoped typecheck will fail elsewhere — expected)**

Run: `pnpm --filter @mysterio/shared build`
Expected: PASS (shared exports `LogicStructure` + `NarrativeAnnotation`, used by the `$type` imports).

> Do NOT run the server typecheck yet — it is expected RED until Task 9. Just confirm shared builds.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/schema.ts
git commit -m "3b-i: pgTable schema — boolean, timestamptz, jsonb columns"
```

---

## Task 3: Client, migrate, and the squashed baseline migration

**Files:**
- Modify: `apps/server/src/db/client.ts`
- Modify: `apps/server/src/db/migrate.ts`
- Delete: `apps/server/src/db/migrations/0000–0005*.sql` + `migrations/meta/`
- Create: `apps/server/src/db/migrations/0000_*.sql` (generated)

- [ ] **Step 1: Rewrite client.ts**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadEnv } from "../config/env.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: Pool | null = null;

export function getDb() {
  if (_db) return _db;
  const env = loadEnv();
  _pool = new Pool({ connectionString: env.DATABASE_URL });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Test-only: inject an already-migrated drizzle instance (see src/test/db.ts). */
export function __setTestDb(db: ReturnType<typeof drizzle<typeof schema>>): void {
  _db = db;
}
```

> `getSqlite()` is removed. `health.ts` (Task 9) stops importing it. The `mkdirSync` for the SQLite file path is gone.

- [ ] **Step 2: Delete the old SQLite migrations**

Run:
```bash
rm apps/server/src/db/migrations/0000_bouncy_meggan.sql \
   apps/server/src/db/migrations/0001_elite_nightmare.sql \
   apps/server/src/db/migrations/0002_slow_edwin_jarvis.sql \
   apps/server/src/db/migrations/0003_nappy_sersi.sql \
   apps/server/src/db/migrations/0004_true_true_believers.sql \
   apps/server/src/db/migrations/0005_last_firedrake.sql
rm -rf apps/server/src/db/migrations/meta
```

- [ ] **Step 3: Generate the Postgres baseline**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: a single new `src/db/migrations/0000_<name>.sql` containing `CREATE TABLE` for all five tables with `boolean`/`timestamp with time zone`/`jsonb` columns, the CHECK constraints, and the indexes; plus a fresh `migrations/meta/`.

- [ ] **Step 4: Eyeball the generated SQL**

Read the new `0000_*.sql`. Confirm: `is_correct boolean not null`, `created_at timestamp with time zone default now() not null`, `logic_structure_json jsonb`, the two unique indexes, the partial unique index `WHERE annotation_id IS NOT NULL`, and all five CHECKs are present. No `__new_` rebuild artifacts (there is no prior history).

- [ ] **Step 5: Rewrite migrate.ts (drop the FK-off dance)**

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./client.js";

await migrate(getDb(), { migrationsFolder: "./src/db/migrations" });
console.log("migrations applied");
process.exit(0);
```

> Postgres `ADD COLUMN`/`CREATE TABLE` never rebuilds a table, so the entire `foreign_keys = OFF` pragma dance is gone. `migrate()` is async — top-level `await` is fine (the package is `"type": "module"`); `process.exit(0)` closes the pool so the script ends.

- [ ] **Step 6: Run the migration against the local docker Postgres**

Run:
```bash
docker compose up -d
pnpm --filter @mysterio/server db:migrate
```
Expected: `migrations applied`. (If docker isn't available in this environment, defer this exact run to Task 11's smoke and note it; pg-mem in Task 4 still exercises the SQL.)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/client.ts apps/server/src/db/migrate.ts apps/server/src/db/migrations
git commit -m "3b-i: pg client + async migrator + squashed Postgres baseline migration"
```

---

## Task 4: Test harness → pg-mem; drop obsolete migration tests

**Files:**
- Modify: `apps/server/src/test/db.ts`
- Delete: `apps/server/src/db/migration_target_age_range.test.ts`
- Delete: `apps/server/src/db/migration_avatar_image_path.test.ts`

- [ ] **Step 1: Rewrite test/db.ts on pg-mem**

Execute the generated baseline SQL directly into a pg-mem instance (no migrator journal — most robust against pg-mem quirks), then hand drizzle the pg-mem Pool.

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __setTestDb } from "../db/client.js";
import * as schema from "../db/schema.js";

const MIGRATIONS = fileURLToPath(new URL("../db/migrations", import.meta.url));

/** Fresh in-memory Postgres (pg-mem) with the baseline schema applied, injected into getDb(). Call in beforeEach. */
export function setupTestDb(): void {
  const mem = newDb();
  // Apply the single squashed baseline migration by executing its statements directly.
  const file = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()[0];
  const sqlText = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) mem.public.none(s);
  }
  const { Pool } = mem.adapters.createPg();
  const db = drizzle(new Pool(), { schema });
  __setTestDb(db);
}
```

> **pg-mem fallback (spec §5):** if `mem.public.none(...)` throws on a statement the generated SQL uses (e.g. an unsupported index predicate or `gen_random_uuid`), do NOT weaken the schema. Escalate to Testcontainers: replace this harness with a `@testcontainers/postgresql` container started in a Vitest `globalSetup`, point `getDb()` at it, and run the real `migrate()`. Flag this switch in the task report.

- [ ] **Step 2: Delete the two SQLite-migration assertion tests**

Run:
```bash
rm apps/server/src/db/migration_target_age_range.test.ts \
   apps/server/src/db/migration_avatar_image_path.test.ts
```

Rationale: they assert the SQLite `ALTER TABLE` / no-`__new_`-rebuild behavior that guarded the FK-cascade gotcha. Those columns now live in the squashed `0000` `CREATE TABLE`, and Postgres has no rebuild gotcha — the tests are obsolete, not ported.

- [ ] **Step 3: Smoke the harness with a trivial throwaway test**

Temporarily add `apps/server/src/test/pgmem.smoke.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./db.js";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";

describe("pg-mem harness", () => {
  beforeEach(() => setupTestDb());
  it("inserts + reads a player with boolean/timestamp defaults", async () => {
    const db = getDb();
    await db.insert(players).values({ id: "p1", name: "Nico", default_difficulty: "easy", age_range: "10-11" });
    const [row] = await db.select().from(players).where(eq(players.id, "p1")).limit(1);
    expect(row.name).toBe("Nico");
    expect(row.created_at).toBeInstanceOf(Date);
  });
});
```

Run: `pnpm --filter @mysterio/server exec vitest run src/test/pgmem.smoke.test.ts`
Expected: PASS. Then delete the smoke file: `rm apps/server/src/test/pgmem.smoke.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/test/db.ts
git rm apps/server/src/db/migration_target_age_range.test.ts apps/server/src/db/migration_avatar_image_path.test.ts
git commit -m "3b-i: pg-mem test harness; drop obsolete SQLite-migration assertion tests"
```

---

## Task 5: Convert players.ts + player tests

**Files:**
- Modify: `apps/server/src/routes/players.ts`
- Modify: `apps/server/src/routes/players.test.ts`, `playersEdit.test.ts`, `playersReputation.test.ts`, `playersAvatar.test.ts`, `trophies.test.ts`

- [ ] **Step 1: Convert players.ts**

Apply the conversion rules. Specific non-mechanical changes:

`reputationByPlayer()` → make **async**, await the query, boolean filter:

```ts
async function reputationByPlayer(): Promise<Map<string, PlayerReputation>> {
  const db = getDb();
  const solved = await db
    .select({ player_id: solutions.player_id, difficulty: mysteries.difficulty })
    .from(solutions)
    .innerJoin(mysteries, eq(solutions.mystery_id, mysteries.id))
    .where(eq(solutions.is_correct, true));
  // …rest unchanged…
}
```

`GET /players`: `const rows = await db.select().from(players); const reps = await reputationByPlayer();`

`POST /players`, `PATCH`, `DELETE`, `POST /:id/avatar`: convert each `.get()`→`const [row] = await …limit(1)`, `.run()`→`await`. (`avatar_description` null handling unchanged.)

`GET /players/:id/trophies`:
- `eq(solutions.is_correct, 1)` → `eq(solutions.is_correct, true)`
- `.all()` → `await`
- `r.logic` is now a `LogicStructure | null` object (jsonb), not a string. Replace the `JSON.parse(r.logic ?? "")` block with a null-guarded direct read:

```ts
let culprit_name: string | null = null;
let how: string | null = null;
const ls = r.logic;
if (ls) {
  how = typeof ls.true_solution?.how === "string" ? ls.true_solution.how : null;
  const who = ls.true_solution?.who_did_it;
  culprit_name = ls.characters?.find((c) => c.id === who)?.name ?? null;
}
```
- `solved_at` is now a `Date`. The sort `b.solved_at - a.solved_at` is a type error on `Date`; use:
```ts
.sort((a, b) => b.solved_at.getTime() - a.solved_at.getTime());
```
(The response still carries `solved_at` as the Date → serialized to an ISO string for the web.)

- [ ] **Step 2: Convert the five player test files**

For each, Read it and apply: seed `db.insert(...).values(...).run()` → `await db.insert(...).values(...)` (drop `.run()`); `.onConflictDoNothing().run()` → `await …onConflictDoNothing()`; integer-boolean seed values `is_correct: 1/0`, `gave_up: 0/1` → `true/false` (leave `hints_used`, `validation_attempts` as ints); any sync seed helper (e.g. `seedSolved`) → `async` + `await` its inserts, and `await` its call sites; any `.get()/.all()` in the test body → `const [x] = await …` / `await …`. Routes are reached via `app.inject` (already async) — those calls are unchanged.

- [ ] **Step 3: Run the player test files**

Run:
```bash
pnpm --filter @mysterio/server exec vitest run \
  src/routes/players.test.ts src/routes/playersEdit.test.ts \
  src/routes/playersReputation.test.ts src/routes/playersAvatar.test.ts \
  src/routes/trophies.test.ts
```
Expected: PASS (other route files may be type-broken — irrelevant to these esbuild-transpiled runs).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/players.ts apps/server/src/routes/players.test.ts apps/server/src/routes/playersEdit.test.ts apps/server/src/routes/playersReputation.test.ts apps/server/src/routes/playersAvatar.test.ts apps/server/src/routes/trophies.test.ts
git commit -m "3b-i: convert players route + tests to async pg (boolean/jsonb/timestamp)"
```

---

## Task 6: Convert mysteries.ts + list/generate tests

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts`
- Modify: `apps/server/src/routes/mysteriesList.test.ts`, `mysteriesGenerate.test.ts`

- [ ] **Step 1: Convert mysteries.ts**

Apply the rules. Specifics:

`POST /mysteries/generate`: `const [player] = await db.select()…limit(1);`, `await db.insert(mysteries).values({…});`. (`void runGeneration({…})` unchanged.)

`GET /mysteries/:id`: `const [row] = await db.select()…limit(1);`. `row.logic_structure_json` is now an object — drop the `JSON.parse`/try-catch; read directly (keep a defensive guard):

```ts
let characters: unknown = undefined;
let central_question: string | null = null;
const ls = row.logic_structure_json;
if (ls && typeof ls === "object") {
  if (Array.isArray(ls.characters)) {
    characters = ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description }));
  }
  if (typeof ls.central_question === "string") central_question = ls.central_question;
}
let narrative_annotations: unknown = null;
if (row.status === "ready" && row.narrative_annotations) {
  narrative_annotations = row.narrative_annotations;
}
```

`created_at: row.created_at, ready_at: row.ready_at` — now Dates; leave as-is (Fastify serializes to ISO). The web type changes in Task 10.

`GET /mysteries/:id/debug`: `const [row] = await db.select()…limit(1);`. `buildDebugView({ … logic_structure_json: row.logic_structure_json … validation_passed: row.validation_passed … })` — types now match the updated `DebugRow` (Task 9).

`POST /mysteries/:id/audio`: `const [row] = await db.select()…limit(1);`. The `persistAudioPath` callback becomes async:
```ts
persistAudioPath: async (id, audioPath) => {
  await db.update(mysteries).set({ audio_path: audioPath }).where(eq(mysteries.id, id));
},
```
> Verify `resolveMysteryAudio` awaits `persistAudioPath`. If its type signature declares a sync `(id, path) => void`, widen it to `=> void | Promise<void>` and `await` the call inside `mysteryAudio.ts`. Surface this if `resolveMysteryAudio` doesn't currently await it (data-loss risk otherwise).

`GET /mysteries` list query:
- `solved: sql<number>\`…is_correct = 1\`` → `solved: sql<boolean>\`EXISTS (SELECT 1 FROM solutions s WHERE s.mystery_id = mysteries.id AND s.player_id = ${playerId} AND s.is_correct = true)\``
- `started: sql<number>\`…\`` → `sql<boolean>\`…\`` (no boolean literal needed there — it's pure EXISTS).
- `.all()` → `await`.
- `rows.map((r) => ({ ...r, solved: r.solved === 1, started: r.started === 1 }))` → `rows.map((r) => ({ ...r }))` (drizzle returns real booleans for `sql<boolean>`; no `=== 1` coercion). Confirm `solved`/`started` are booleans in the response.

- [ ] **Step 2: Convert the two test files**

Same seed transforms as Task 5 (`.run()`→await, `is_correct: 1`→`true`, etc.). `mysteriesGenerate.test.ts` mocks the orchestrator — leave mocks intact. Assertions on `m.solved`/`m.started` (booleans) and `target_age_range` are unchanged.

- [ ] **Step 3: Run**

Run: `pnpm --filter @mysterio/server exec vitest run src/routes/mysteriesList.test.ts src/routes/mysteriesGenerate.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/mysteries.ts apps/server/src/routes/mysteriesList.test.ts apps/server/src/routes/mysteriesGenerate.test.ts
git commit -m "3b-i: convert mysteries route + tests to async pg"
```

---

## Task 7: Convert solutions.ts + tests

**Files:**
- Modify: `apps/server/src/routes/solutions.ts`
- Modify: `apps/server/src/routes/solutions.test.ts`

- [ ] **Step 1: Convert solutions.ts**

Apply the rules. Specifics:

All `db.select()…get()` → `const [x] = await …limit(1)`; `.all()` → `await`. `JSON.parse(myst.logic_structure_json) as LogicStructure` → `myst.logic_structure_json` (already typed `LogicStructure`; the `if (!myst.logic_structure_json …)` null guards still hold).

`submit-solution` insert — booleans, no `? 1 : 0`:
```ts
await db.insert(solutions).values({
  id: shortId(), mystery_id: myst.id, player_id: playerId,
  guess_who: parsed.data.guess_who, guess_how: parsed.data.guess_how, guess_why: parsed.data.guess_why,
  is_correct, who_match, how_match, why_match,
  hints_used: hintRow.length, gave_up: false, explanation,
});
```

`give-up` insert: `is_correct: false`, `who_match: null, how_match: null, why_match: null`, `gave_up: true`.

`solutionResponse(...)` → make **async** (`async function solutionResponse(...)`), await both selects, and `myst.logic_structure_json` is the object. Update both call sites: `return await solutionResponse(myst.id, playerId);` and in `GET /solution`: `const r = await solutionResponse(...)`.

`solve-options`: `const [myst] = await …limit(1)`, `const [existing] = await …limit(1)`, `myst.logic_structure_json` direct. `shuffle()` unchanged.

- [ ] **Step 2: Convert solutions.test.ts**

Same seed transforms. Watch for assertions that read `solution.is_correct` / `who_match` — they are now `true/false`/`null` (not `1/0`); update any `toBe(1)` / `toBe(0)` to `toBe(true)`/`toBe(false)`, and `toBe(null)` stays. `created_at` assertions (if any) become ISO strings — assert `typeof … === "string"` rather than a number.

- [ ] **Step 3: Run**

Run: `pnpm --filter @mysterio/server exec vitest run src/routes/solutions.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/solutions.ts apps/server/src/routes/solutions.test.ts
git commit -m "3b-i: convert solutions route + tests to async pg (boolean matches)"
```

---

## Task 8: Convert hints.ts + clues.ts + hints test

**Files:**
- Modify: `apps/server/src/routes/hints.ts`, `apps/server/src/routes/clues.ts`
- Modify: `apps/server/src/routes/hints.test.ts`

- [ ] **Step 1: Convert hints.ts**

`POST /:id/hints`: `const [myst] = await …limit(1)`, `const [sol] = await …limit(1)`, `const prior = await …` (was `.all()`). `myst.logic_structure_json` direct (object). `await db.insert(hints).values({…});` then `const [row] = await db.select().from(hints).where(eq(hints.id, id)).limit(1);`.

`GET /:id/hints`: `const rows = await db.select()…` (drop `.all()`).

- [ ] **Step 2: Convert clues.ts**

All `.get()` → `const [x] = await …limit(1)`, `.all()` → `await`, `.run()` → `await`. The dedupe `const [existing] = await …limit(1)`. No boolean/jsonb columns in `clues` — `audio_timestamp_ms` stays integer.

- [ ] **Step 3: Convert hints.test.ts**

Same seed transforms (`.run()`→await; any `is_correct`/`gave_up` seeds → booleans).

- [ ] **Step 4: Run**

Run: `pnpm --filter @mysterio/server exec vitest run src/routes/hints.test.ts`
Expected: PASS.

> `clues.ts` has no dedicated test file; it is covered by the full typecheck + suite in Task 11.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/hints.ts apps/server/src/routes/clues.ts apps/server/src/routes/hints.test.ts
git commit -m "3b-i: convert hints + clues routes to async pg"
```

---

## Task 9: Convert orchestrator, startup, index, health, debugView

**Files:**
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/startup.ts`, `apps/server/src/index.ts`
- Modify: `apps/server/src/routes/health.ts`, `apps/server/src/routes/debugView.ts`

- [ ] **Step 1: orchestrator.ts**

Every `db.update(mysteries).set({…}).where(…).run()` → `await db.update(mysteries).set({…}).where(…)`. Plus:
- `logic_structure_json: JSON.stringify(logic)` → `logic_structure_json: logic`
- `validation_passed: 1` → `validation_passed: true`; `validation_passed: 0` → `validation_passed: false`
- `narrative_annotations: JSON.stringify(prose.value.annotations)` → `narrative_annotations: prose.value.annotations`
- `ready_at: Math.floor(Date.now() / 1000)` → `ready_at: new Date()`
- The `catch` block's `db.update(...).run()` → `await db.update(...)` (still inside the inner try/catch).

- [ ] **Step 2: startup.ts (no `result.changes` in pg)**

```ts
import { notInArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { mysteries } from "./db/schema.js";
import { logger } from "./utils/logger.js";

export async function markStaleMysteriesFailed(): Promise<void> {
  const db = getDb();
  const updated = await db.update(mysteries)
    .set({ status: "failed", failure_reason: "server_restart" })
    .where(notInArray(mysteries.status, ["ready", "failed"]))
    .returning({ id: mysteries.id });
  if (updated.length > 0) {
    logger.info("stale_mysteries_failed", { count: updated.length });
  }
}
```

- [ ] **Step 3: index.ts — await the now-async startup**

Change `markStaleMysteriesFailed();` to `await markStaleMysteriesFailed();`.

- [ ] **Step 4: health.ts — drop getSqlite**

```ts
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    let dbOk = false;
    try {
      await getDb().execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { ok: true, db: dbOk };
  });
}
```

- [ ] **Step 5: debugView.ts — jsonb + boolean types**

In `DebugRow`: `logic_structure_json: string | null` → `logic_structure_json: LogicStructure | null`; `validation_passed: number | null` → `validation_passed: boolean | null`. Add the `LogicStructure` import if not present. Remove `parseLogic` and use the object directly:

```ts
export function buildDebugView(row: DebugRow): DebugView {
  const logic = row.logic_structure_json;
  // …unchanged…
  validation: {
    passed: row.validation_passed,   // already boolean | null
    attempts: row.validation_attempts,
    notes: row.validation_notes,
  },
```

(Delete the `parseLogic` function and the now-unused `JSON.parse` import context.)

- [ ] **Step 6: Run the orchestrator-touching tests (if any) + the debug path**

Run: `pnpm --filter @mysterio/server exec vitest run`
Expected: the full suite now runs; **all server tests PASS** (this is the first point every consumer is converted). If a test file still references SQLite integer-booleans or `.run()`, fix it per the Task 5 transform rules and re-run.

- [ ] **Step 7: Server typecheck**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS (project-wide green for the first time).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/services/generation/orchestrator.ts apps/server/src/startup.ts apps/server/src/index.ts apps/server/src/routes/health.ts apps/server/src/routes/debugView.ts
git commit -m "3b-i: convert orchestrator/startup/health/debug to async pg; server typecheck green"
```

---

## Task 10: DTO contract — shared types + web

**Files:**
- Modify: `packages/shared/src/types/mystery.ts`, `solution.ts`, `clue.ts`, `hint.ts`
- Modify: `apps/web/src/api/mysteries.ts`, `apps/web/src/api/players.ts`
- Modify: `apps/web/src/screens/TrophyRoom/TrophyRoom.tsx`

- [ ] **Step 1: shared — timestamps to ISO strings, solution booleans to real booleans**

In `packages/shared/src/types/mystery.ts`:
- `Player.created_at: number` → `created_at: string`
- `MysterySummary.created_at: number` → `string`; `ready_at: number | null` → `string | null`

In `packages/shared/src/types/solution.ts` — booleans + timestamp:
```ts
is_correct: boolean;
who_match: boolean | null;
how_match: boolean | null;
why_match: boolean | null;
gave_up: boolean;
created_at: string;
```
(Remove the `// SQLite: 0 | 1` comments.)

In `packages/shared/src/types/clue.ts` and `hint.ts`: `created_at: number` → `created_at: string`.

- [ ] **Step 2: web api types**

`apps/web/src/api/mysteries.ts` — `MysteryDetail`: `created_at: number` → `string`; `ready_at: number | null` → `string | null`.

`apps/web/src/api/players.ts` — `Trophy`: `solved_at: number` → `string`.

- [ ] **Step 3: TrophyRoom.tsx — parse ISO**

```ts
function solvedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
```
And the two call sites pass `t.solved_at` / `trophy.solved_at` (now `string`) unchanged.

> Web boolean consumers (`RevealPanel.tsx`: `if (s.is_correct)`, `s.who_match ? 1 : 0`, `?? false`; `RecentList.tsx`: `m.solved`) are all truthy checks — they work unchanged with real booleans. No edits needed there beyond the type change in shared.

- [ ] **Step 4: Build shared, then web typecheck + build**

Run:
```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/web typecheck
pnpm --filter @mysterio/web build
```
Expected: all PASS. If `tsc -b` flags any other web consumer of these fields as a number, fix it (the inventory found none beyond the three files above, but verify).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types apps/web/src/api apps/web/src/screens/TrophyRoom/TrophyRoom.tsx
git commit -m "3b-i: DTO contract — ISO-string timestamps + boolean solution fields"
```

---

## Task 11: Full gate + docker-compose-Postgres smoke

**Files:** none (verification only)

- [ ] **Step 1: Full green gate**

Run:
```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server test
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/web typecheck
pnpm --filter @mysterio/web build
```
Expected: every command PASS.

- [ ] **Step 2: Real-Postgres migrate + boot smoke**

Run:
```bash
docker compose up -d
# wait for healthy
until docker compose exec -T postgres pg_isready -U mysterio; do sleep 1; done
pnpm --filter @mysterio/server db:migrate           # baseline applies clean
DATABASE_URL=postgresql://mysterio:mysterio@localhost:5432/mysterio \
  pnpm --filter @mysterio/server dev &              # boot server
sleep 3
curl -fsS http://localhost:3000/api/health          # {"ok":true,"db":true}
curl -fsS "http://localhost:3000/api/players"        # {"players":[]}
# stop the dev server (kill %1) when done
```
Expected: health returns `db:true`; `/api/players` returns an empty list (or seeded players if `db:seed` ran). Stop the server and `docker compose down` when finished.

> This is the real-PG fidelity check beyond pg-mem. It is free (no LLM/image calls). If `db:migrate` or the boot fails against real Postgres in a way pg-mem masked, fix the schema/migration and re-run Tasks 3–4's verifications.

- [ ] **Step 3: Final commit (if any smoke fixes) + branch status**

```bash
git add -A
git commit -m "3b-i: gate green + docker-compose Postgres smoke verified" --allow-empty
```

- [ ] **Step 4: Do NOT deploy to the VM**

3b-i ends here. The VM still runs SQLite. Provisioning `postgresql.service`, the data ETL, and the production cutover are **3b-ii**. Hand back to the user: 3b-i is gate-green and locally smoke-verified against real Postgres; ready to design 3b-ii.

---

## Self-Review

**Spec coverage** (each spec §Design item → task):
- Driver & connection (pg, async, pool, drop getSqlite, health, env, drizzle.config) → Tasks 1, 3, 9. ✅
- Schema pgTable (boolean/timestamptz/jsonb/CHECK/indexes) → Task 2. ✅
- Migrations (squashed baseline, delete old, plain migrate, no FK dance) → Task 3. ✅
- Web ripple (3 files) → Task 10. ✅
- Tests (pg-mem, fallback to Testcontainers, drop migration-assertion tests) → Task 4 (+ per-route test conversions Tasks 5–9). ✅
- Local dev (docker-compose) → Task 1. ✅
- Acceptance gate (shared/server/web + docker smoke, no VM deploy) → Task 11. ✅
- Async ripple across all consumers → Tasks 5–9. ✅
- DTO contract change confined + verified → Task 10. ✅

**Placeholder scan:** no TBD/TODO; every code step shows code; transform rules are explicit. Test-file edits reference a documented rule table rather than re-pasting unseen file bodies — the implementer has Read access and exact patterns. ✅

**Type consistency:** `__setTestDb(db)` single-arg (Task 3 def, Task 4 use) ✅; `markStaleMysteriesFailed(): Promise<void>` (Task 9 def, Task 9 index await) ✅; `reputationByPlayer(): Promise<…>` async (Task 5) ✅; `solutionResponse` async + awaited at both call sites (Task 7) ✅; `DebugRow.logic_structure_json: LogicStructure | null` matches `mysteries.ts` passing `row.logic_structure_json` (Tasks 6, 9) ✅; `sql<boolean>` for solved/started matches dropping `=== 1` (Task 6) ✅.

**Watch-items surfaced for implementers:**
1. `resolveMysteryAudio`'s `persistAudioPath` callback must be awaited — widen its signature to allow `Promise<void>` (Task 6 Step 1). Data-loss risk if missed.
2. pg-mem may reject a generated statement → Testcontainers fallback, flagged not silently weakened (Task 4 Step 1).
3. Plan-text transcription bugs (`.ts`→`.js` imports etc.) — fix silently per `feedback_plan_text_bugs`.
