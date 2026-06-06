# Spec 3b-i — SQLite → Postgres port (code only)

**Date:** 2026-06-06
**Program:** Maple Hollow — World & Reputation (Spec 3), sub-spec 3b
**Status:** Design approved; ready for implementation plan

## Context

3b is the SQLite → Postgres migration. It exists because **3c** (recurring cast + places +
generation overhaul) needs a relational model with clean `ALTER`s; doing the DB migration
first avoids writing every migration twice and sidesteps the SQLite FK-cascade-rebuild gotcha
(`reference_sqlite_fk_migration_gotcha`).

The Postgres instance is **self-hosted on the VM** (`postgresql.service` alongside
`mysterio.service`) — a locked decision; not managed Neon/Supabase.

3b is split into two sequential sub-specs:

- **3b-i (this spec)** — port all code to Postgres, prove it gate-green against a **local
  docker-compose Postgres**. **No production state is touched**; the live app stays on SQLite.
- **3b-ii (next)** — VM `postgresql.service` provisioning + backup + one-time ETL of the live
  data + VM deploy + production cutover + iPad validation.

### Why the live app stays on SQLite through all of 3b-i

Deploying a Postgres-backed app over an *empty* VM database would blank out the live ~23
mysteries (+ players/clues/solutions/hints) until the data is migrated. So the VM never sees
the ported app until 3b-ii, where provisioning + ETL + deploy + cutover happen together as one
atomic production move. 3b-i is fully testable locally without that risk.

## Current state (verified 2026-06-06)

- Driver: `better-sqlite3` + `drizzle-orm/better-sqlite3`, **synchronous** — drizzle calls
  return values directly, no `await`.
- `apps/server/src/db/`: `client.ts` (`getDb`/`getSqlite`/`__setTestDb`), `schema.ts`
  (`sqliteTable`), `migrate.ts` (the FK-off dance), `migrations/0000–0005` + `meta/`.
- `drizzle.config.ts`: `dialect: "sqlite"`, `dbCredentials.url = DATABASE_PATH`.
- `env.ts`: `DATABASE_PATH` (default `./data/mysterio.db`).
- Test harness `src/test/db.ts`: in-memory `better-sqlite3` per test via `setupTestDb()`.
- `deploy.sh` runs `pnpm --filter @mysterio/server db:migrate` on the VM.

### Integer-booleans stored 0/1 (→ real `boolean`)

`mysteries.validation_passed`; `solutions.is_correct`, `who_match`, `how_match`, `why_match`,
`gave_up`. Code writes `? 1 : 0`, reads `=== 1`, queries `eq(solutions.is_correct, 1)`, and
uses one raw SQL `s.is_correct = 1` (`routes/mysteries.ts:158`).

### Integer-timestamps via `unixepoch()` (epoch **seconds**) (→ `timestamptz`)

`mysteries.created_at`, `mysteries.ready_at`, `players.created_at`, `clues.created_at`,
`solutions.created_at`, `hints.created_at`. Sent to web as raw numbers.

**Web consumers (3 files):** `apps/web/src/api/mysteries.ts` (`created_at: number`,
`ready_at: number | null`), `apps/web/src/api/players.ts` (`solved_at: number`),
`apps/web/src/screens/TrophyRoom/TrophyRoom.tsx` (`new Date(ms * 1000)`).

### JSON-as-TEXT columns (→ `jsonb`)

`mysteries.logic_structure_json`, `mysteries.narrative_annotations`.

**Server read sites that `JSON.parse`:** `routes/hints.ts`, `routes/solutions.ts` (×5),
`routes/debugView.ts` (+ its local `string | null` row type), `routes/players.ts`,
`routes/mysteries.ts`. **Write sites that `JSON.stringify`:** the orchestrator (and any other
insert/update of those columns).

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| Decomposition | Split: 3b-i (port, local PG, green) → 3b-ii (ETL + cutover) |
| VM provisioning + VM deploy | Moved to 3b-ii (rides with the cutover) |
| Driver | `node-postgres` (`pg`) + `drizzle-orm/node-postgres` — pg-mem's adapter targets it |
| Timestamps | Real `timestamptz`; **update the 3 web consumers** to ISO strings |
| Booleans | Real PG `boolean` |
| JSON columns | `jsonb` with drizzle `.$type<…>()`; drop `JSON.parse`/`JSON.stringify` |
| Migrations | **Single squashed `0000` baseline** generated from the final schema; delete 0000–0005 + `meta/` |
| `migrate.ts` | Plain `migrate()`; **drop the entire FK-off dance** (no rebuilds in PG) |
| Test DB | **pg-mem** in-process; **fallback to Testcontainers** if pg-mem can't digest the schema/migrations |
| Local dev PG | `docker-compose.yml` Postgres service |

## Design

### 1. Driver & connection

- Replace `better-sqlite3`/`drizzle-orm/better-sqlite3` with `pg` + `drizzle-orm/node-postgres`.
  Remove `@types/better-sqlite3`.
- **All drizzle calls become async** — add `await` at every call site (routes + services). This
  is the widest-reaching mechanical change; the plan enumerates the sites.
- `client.ts`: `getDb()` builds a `pg.Pool` from `env.DATABASE_URL` and returns
  `drizzle(pool, { schema })`. Remove `getSqlite()`. Keep `__setTestDb(db)` for pg-mem injection
  (signature simplifies — no separate sqlite handle).
- `routes/health.ts`: replace `getSqlite().prepare("SELECT 1").run()` with an async drizzle/pool
  `SELECT 1`.
- `env.ts`: `DATABASE_PATH` → `DATABASE_URL` (e.g. `postgresql://mysterio:mysterio@localhost:5432/mysterio`).
- `drizzle.config.ts`: `dialect: "postgresql"`, `dbCredentials: { url: process.env.DATABASE_URL }`.

### 2. Schema (`pgTable`)

Port `schema.ts` table-for-table to `pgTable`, preserving table/column names, `text` PKs,
indexes, unique indexes, and CHECK constraints.

- **Booleans** → `boolean(...)`. Carry existing `.notNull()`/`.default(...)` intent
  (`is_correct` not-null; `who/how/why_match` nullable; `gave_up`/`hints_used` default).
  Server changes: writes use `true/false`; reads use the boolean directly (drop `=== 1`);
  `eq(solutions.is_correct, 1)` → `eq(solutions.is_correct, true)`; raw `s.is_correct = 1` →
  `s.is_correct = true`. The existing `solved`/`started` booleanization in `mysteries.ts`
  simplifies (the EXISTS subquery already yields a boolean in PG).
- **Timestamps** → `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()` and
  nullable `ready_at`. Drizzle returns `Date`; JSON serializes to ISO. Web consumers updated
  (§4).
- **JSON** → `jsonb("logic_structure_json").$type<LogicStructure>()` and the annotations type.
  Read sites drop `JSON.parse` (drizzle returns the object). Write sites drop `JSON.stringify`
  (pass the object). `debugView.ts`'s local row type updates from `string | null` to the parsed
  type.
- **CHECK constraints** ported natively — `pgTable` supports `check(...)` without a table
  rebuild, so all five (difficulty, status, age_range, clue category, clue source) stay.

### 3. Migrations

- Generate **one squashed `0000` baseline** from the final `pgTable` schema with
  `drizzle-kit generate` (the new VM database has no SQLite migration history worth preserving).
- Delete `migrations/0000–0005*.sql` and `migrations/meta/`.
- `migrate.ts` → plain `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator`.
  **Remove the FK-off pragma dance entirely** — Postgres `ADD COLUMN` does not rebuild tables.

### 4. Web ripple (3 files)

- `api/mysteries.ts`: `created_at: string`, `ready_at: string | null`.
- `api/players.ts`: `solved_at: string`.
- `TrophyRoom.tsx`: `solvedDate(iso: string)` → `new Date(iso)` (drop `* 1000`); same
  `toLocaleDateString` formatting.

Inventory the web app once more during implementation to confirm no other consumer reads these
fields as numbers.

### 5. Tests (pg-mem)

- `src/test/db.ts`: `setupTestDb()` builds a pg-mem database (`newDb()`), exposes its `pg`
  adapter, runs the baseline migration, and injects via `__setTestDb`.
- `migration_target_age_range.test.ts` / `migration_avatar_image_path.test.ts`: re-point at the
  squashed baseline or replace with equivalent schema-shape assertions (the columns they guard
  now live in `0000`).
- **Fallback:** if pg-mem rejects the generated SQL or a jsonb/CHECK/index feature, escalate the
  test backend to Testcontainers (real ephemeral Postgres in Docker). Note the switch in the
  plan; don't silently weaken coverage.

### 6. Local dev

- Add `docker-compose.yml` at repo root: `postgres:16` service, named volume, exposed `5432`,
  matching `DATABASE_URL`.
- `.env.example` (or docs) documents `DATABASE_URL` and `docker compose up -d` before `pnpm dev`.

## Acceptance (3b-i gate)

1. `pnpm --filter @mysterio/shared build` — green.
2. `pnpm --filter @mysterio/server test` (vitest on pg-mem) — green.
3. `pnpm --filter @mysterio/server typecheck` — green.
4. `pnpm --filter @mysterio/web typecheck` + `vite build` — green.
5. **Local docker-compose-PG smoke:** `db:migrate` applies the baseline clean against a fresh
   Postgres, the server boots, `/api/health` returns ok, and one data route responds.
6. No VM deploy; live production untouched.

## Out of scope (→ 3b-ii)

- VM `postgresql.service` provisioning (DB + role + grants).
- Backup of the live SQLite database (at `apps/server/.env`'s `DATABASE_PATH` on the VM).
- One-time ETL: copy all rows SQLite → Postgres, **preserving text PKs and exact `created_at`
  epoch values** (convert epoch-seconds → `timestamptz`), in FK-safe order
  (players → mysteries → clues/solutions/hints). Test against a **populated copy**, never the
  live DB.
- `deploy.sh` migrate-step verification against PG.
- Production cutover (stop service → final ETL → switch `DATABASE_URL` → deploy → start) and
  iPad validation.

## Risks & mitigations

- **Async ripple is wide.** Mitigate with `typecheck` (a missed `await` on a drizzle call
  surfaces as a type error or a Promise leak) + the per-task subagent reviews.
- **pg-mem fidelity.** Known imperfect SQL coverage — fallback to Testcontainers is pre-approved.
- **jsonb typing drift.** `.$type<LogicStructure>()` asserts, it doesn't validate; the existing
  Zod validation in the pipeline still guards writes. Reads now trust the column type — keep the
  existing try/catch spoiler-safety in trophies/debug.
- **DTO contract change is intentional** (timestamps now ISO strings). Confined to the 3 web
  files above; verify no third consumer.

## Conventions

- Subagent-driven (`workflow_subagent_driven`): implementer → spec review → code-quality review
  per task; **sonnet** for implementer + reviewers (`workflow_model_selection`).
- Plan-text transcription bugs fixed silently (`feedback_plan_text_bugs`).
- 3b-i is pure infra — building/testing costs no LLM/image money; no paid smokes here.
