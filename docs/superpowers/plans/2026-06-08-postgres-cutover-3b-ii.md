# Spec 3b-ii — Postgres Cutover (ETL + provisioning + runbook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested one-time SQLite→Postgres ETL, fix the broken seed script, document the VM provisioning + cutover runbook, and prove the whole thing with a dry-run against a copy of the live database — so the production cutover is a replay of a verified procedure.

**Architecture:** A testable ETL core `runEtl(sqlite, db)` (reads SQLite via `better-sqlite3`, re-added as a devDependency; inserts through the existing drizzle-pg schema) with per-column transforms (epoch-seconds→`Date`, `0/1`→boolean, TEXT-JSON→jsonb), FK-safe insert order, a single transaction, a no-double-load guard, and a source-vs-inserted count report. A thin CLI wraps it (`db:etl`). The seed script is fixed to async + empty-DB-guarded. A runbook documents provisioning + the ordered cutover. A gated local dry-run against the live data copy is the correctness proof.

**Tech Stack:** TypeScript, Drizzle ORM (`node-postgres`), `better-sqlite3` (devDep, ETL-only), `pg`, Vitest, pg-mem, Postgres 16, Ubuntu 24.04 (apt), systemd --user.

---

## Verified live data (recon 2026-06-08) — the ETL's target shape

- Real DB: `~/mysterio/data/mysterio.db` (the VM `.env` `DATABASE_PATH=../../data/mysterio.db`).
- Rows: **players 6 · mysteries 24 (21 ready, 3 failed) · clues 1 · solutions 1 · hints 0**.
- No NULL `player_id` in any child table. Timestamps are epoch-seconds ints. Booleans are 0/1. JSON
  columns are TEXT. Schema fully at migration 0005 (all PG-baseline columns present).

## File Structure

**Create:**
- `apps/server/scripts/migrate-sqlite-to-pg.ts` — ETL: transform helpers + `runEtl()` core + CLI `main()`.
- `apps/server/scripts/migrate-sqlite-to-pg.test.ts` — integration test (fixture SQLite → pg-mem).
- `docs/runbooks/postgres-cutover.md` — provisioning + ordered cutover + rollback runbook.

**Modify:**
- `apps/server/package.json` — add `better-sqlite3` + `@types/better-sqlite3` devDeps; add `db:etl` script.
- `apps/server/scripts/seed-players.ts` — fix to async drizzle-pg; guard to seed only an empty DB.

---

## Task 1: Re-add better-sqlite3 (devDep) + ETL transform helpers + `runEtl` core

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/scripts/migrate-sqlite-to-pg.ts`

- [ ] **Step 1: Add the devDependencies**

In `apps/server/package.json` `devDependencies`, add (keep alphabetical-ish; these are ETL-only, never imported by the running server):

```jsonc
"@types/better-sqlite3": "^7.6.11",
"better-sqlite3": "^11.5.0",
```

Add to `scripts`:
```jsonc
"db:etl": "tsx --env-file=.env scripts/migrate-sqlite-to-pg.ts",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: `better-sqlite3` + `@types/better-sqlite3` resolved (better-sqlite3 builds its native binding).

- [ ] **Step 3: Write the ETL module**

Create `apps/server/scripts/migrate-sqlite-to-pg.ts`:

```ts
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";

const { players, mysteries, clues, solutions, hints } = schema;
type Db = NodePgDatabase<typeof schema>;

// ---- per-column transforms (pure, unit-testable) ----
/** epoch-seconds int (SQLite) → JS Date (timestamptz). null-safe. */
export const toDate = (secs: number | null): Date | null =>
  secs == null ? null : new Date(secs * 1000);
/** SQLite 0/1/NULL → boolean/null. */
export const toBoolN = (v: number | null): boolean | null =>
  v == null ? null : v !== 0;
/** NOT-NULL boolean column: SQLite 0/1 → boolean (throws on null). */
export const toBool = (v: number | null): boolean => {
  if (v == null) throw new Error("toBool: unexpected null for a NOT NULL boolean column");
  return v !== 0;
};
/** TEXT JSON (SQLite) → parsed object (jsonb). null-safe. */
export const parseJson = <T>(s: string | null): T | null =>
  s == null ? null : (JSON.parse(s) as T);

const TABLES = ["players", "mysteries", "clues", "solutions", "hints"] as const;

export interface EtlReport {
  table: string;
  source: number;
  inserted: number;
}

/** Throws if any child row has a NULL player_id (NOT NULL in PG) — fail loud, never drop. */
function assertChildPlayerIds(sqlite: Database.Database): void {
  for (const t of ["clues", "solutions", "hints"] as const) {
    const bad = sqlite.prepare(`SELECT id FROM ${t} WHERE player_id IS NULL LIMIT 5`).all() as { id: string }[];
    if (bad.length > 0) {
      throw new Error(`${t} has rows with NULL player_id (cannot migrate to NOT NULL): ${bad.map((r) => r.id).join(", ")}`);
    }
  }
}

/**
 * Copy all rows SQLite → Postgres in one transaction, FK-safe order, with transforms.
 * Refuses to run if any target table is non-empty unless opts.truncate.
 */
export async function runEtl(
  sqlite: Database.Database,
  db: Db,
  opts: { truncate?: boolean } = {},
): Promise<EtlReport[]> {
  assertChildPlayerIds(sqlite);

  const report: EtlReport[] = [];

  await db.transaction(async (tx) => {
    // ---- no-double-load guard ----
    const existing: Record<string, number> = {};
    for (const t of TABLES) {
      const [{ n }] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)}`);
      existing[t] = Number(n);
    }
    const totalExisting = Object.values(existing).reduce((a, b) => a + b, 0);
    if (totalExisting > 0 && !opts.truncate) {
      throw new Error(
        `Target Postgres is not empty (${JSON.stringify(existing)}). Refusing to load. Pass --truncate to overwrite.`,
      );
    }
    if (totalExisting > 0 && opts.truncate) {
      // child → parent order for TRUNCATE
      await tx.execute(sql`TRUNCATE TABLE hints, solutions, clues, mysteries, players RESTART IDENTITY CASCADE`);
    }

    // ---- players ----
    const pRows = sqlite.prepare("SELECT * FROM players").all() as any[];
    if (pRows.length) {
      await tx.insert(players).values(pRows.map((r) => ({
        id: r.id,
        name: r.name,
        default_difficulty: r.default_difficulty,
        age_range: r.age_range,
        avatar_description: r.avatar_description,
        avatar_image_path: r.avatar_image_path,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- mysteries ----
    const mRows = sqlite.prepare("SELECT * FROM mysteries").all() as any[];
    if (mRows.length) {
      await tx.insert(mysteries).values(mRows.map((r) => ({
        id: r.id,
        player_id: r.player_id,
        category: r.category,
        difficulty: r.difficulty,
        target_age_range: r.target_age_range,
        status: r.status,
        title: r.title,
        logic_structure_json: parseJson<LogicStructure>(r.logic_structure_json),
        narrative_text: r.narrative_text,
        narrative_annotations: parseJson<NarrativeAnnotation[]>(r.narrative_annotations),
        audio_path: r.audio_path,
        cover_image_path: r.cover_image_path,
        validation_passed: toBoolN(r.validation_passed),
        validation_attempts: r.validation_attempts,
        validation_notes: r.validation_notes,
        failure_reason: r.failure_reason,
        created_at: toDate(r.created_at)!,
        ready_at: toDate(r.ready_at),
      })));
    }

    // ---- clues ----
    const cRows = sqlite.prepare("SELECT * FROM clues").all() as any[];
    if (cRows.length) {
      await tx.insert(clues).values(cRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        category_type: r.category_type,
        content: r.content,
        audio_timestamp_ms: r.audio_timestamp_ms,
        source: r.source,
        annotation_id: r.annotation_id,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- solutions ----
    const sRows = sqlite.prepare("SELECT * FROM solutions").all() as any[];
    if (sRows.length) {
      await tx.insert(solutions).values(sRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        guess_who: r.guess_who,
        guess_how: r.guess_how,
        guess_why: r.guess_why,
        is_correct: toBool(r.is_correct),
        who_match: toBoolN(r.who_match),
        how_match: toBoolN(r.how_match),
        why_match: toBoolN(r.why_match),
        hints_used: r.hints_used,
        gave_up: toBool(r.gave_up),
        explanation: r.explanation,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- hints ----
    const hRows = sqlite.prepare("SELECT * FROM hints").all() as any[];
    if (hRows.length) {
      await tx.insert(hints).values(hRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        content: r.content,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- count parity report ----
    const counts: Record<string, number> = { players: pRows.length, mysteries: mRows.length, clues: cRows.length, solutions: sRows.length, hints: hRows.length };
    for (const t of TABLES) {
      const [{ n }] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)}`);
      const inserted = Number(n) - (opts.truncate ? 0 : existing[t]); // existing was 0 on the guarded happy path
      report.push({ table: t, source: counts[t], inserted });
      if (report[report.length - 1].inserted !== counts[t]) {
        throw new Error(`Count mismatch for ${t}: source ${counts[t]} != inserted ${inserted}`);
      }
    }
  });

  return report;
}

// ---- CLI ----
function parseArgs(argv: string[]): { sqlitePath: string; truncate: boolean } {
  let sqlitePath = process.env.SQLITE_DB_PATH ?? "";
  let truncate = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sqlite") sqlitePath = argv[++i] ?? "";
    else if (argv[i] === "--truncate") truncate = true;
  }
  if (!sqlitePath) throw new Error("Provide the SQLite DB path via --sqlite <path> or SQLITE_DB_PATH");
  return { sqlitePath, truncate };
}

async function main(): Promise<void> {
  const { sqlitePath, truncate } = parseArgs(process.argv.slice(2));
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const db = getDb() as unknown as Db;
  const report = await runEtl(sqlite, db, { truncate });
  sqlite.close();
  for (const r of report) console.log(`  ${r.table}: source=${r.source} inserted=${r.inserted}`);
  console.log("ETL complete — counts match.");
  process.exit(0);
}

// Only run main() when executed directly (not when imported by the test).
const isDirectRun = process.argv[1] && process.argv[1].endsWith("migrate-sqlite-to-pg.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("ETL failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
```

> Notes for the implementer:
> - `tx.execute<{n:number}>(sql\`SELECT count(*)::int AS n ...\`)` returns rows; drizzle-pg's
>   `execute` returns an array-like — if the installed drizzle version returns `{ rows }` instead of
>   a bare array, adjust to `(await tx.execute(...)).rows[0]`. Verify against the actual return shape
>   and fix silently (this is a known drizzle-version wrinkle).
> - `sql.identifier(t)` safely quotes the table name. If `tx.execute` + `sql.identifier` interpolation
>   misbehaves on your drizzle version, replace the per-table count with five literal
>   `sql\`SELECT count(*)::int AS n FROM players\`` statements (no dynamic identifier). Prefer the
>   explicit form if in doubt — clarity over cleverness.
> - The `as any[]` on SQLite reads is deliberate: better-sqlite3 returns untyped row objects.

- [ ] **Step 4: Typecheck the script compiles**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS (the script is under `scripts/`, included by tsconfig; if tsconfig excludes `scripts/`, that's fine — then verify with `pnpm --filter @mysterio/server exec tsc --noEmit scripts/migrate-sqlite-to-pg.ts` won't resolve project refs; instead rely on Task 2's test to exercise it). Do not run the ETL against any real DB yet.

- [ ] **Step 5: Commit**

```bash
git add apps/server/package.json apps/server/scripts/migrate-sqlite-to-pg.ts pnpm-lock.yaml
git commit -m "3b-ii: ETL script (better-sqlite3 devDep) — transforms + runEtl core + CLI"
```

---

## Task 2: ETL integration test (fixture SQLite → pg-mem)

**Files:**
- Create: `apps/server/scripts/migrate-sqlite-to-pg.test.ts`

- [ ] **Step 1: Write the test**

This builds a tiny in-memory SQLite DB with the **legacy** schema (integer timestamps, 0/1 booleans, TEXT JSON), seeds rows mirroring the live shape, runs `runEtl` into the pg-mem test DB, and asserts count parity + transformed values (Date, boolean, jsonb object, preserved epoch).

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../src/test/db.js";
import { getDb } from "../src/db/client.js";
import { mysteries, players, solutions } from "../src/db/schema.js";
import { runEtl, toDate, toBool, toBoolN, parseJson } from "./migrate-sqlite-to-pg.js";

// Legacy SQLite schema: integer timestamps, integer booleans, TEXT json. Minimal columns the ETL reads.
function makeFixtureSqlite(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT, default_difficulty TEXT, age_range TEXT,
      avatar_description TEXT, avatar_image_path TEXT, created_at INTEGER);
    CREATE TABLE mysteries (id TEXT PRIMARY KEY, player_id TEXT, category TEXT, difficulty TEXT,
      target_age_range TEXT, status TEXT, title TEXT, logic_structure_json TEXT, narrative_text TEXT,
      narrative_annotations TEXT, audio_path TEXT, cover_image_path TEXT, validation_passed INTEGER,
      validation_attempts INTEGER, validation_notes TEXT, failure_reason TEXT, created_at INTEGER, ready_at INTEGER);
    CREATE TABLE clues (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, category_type TEXT, content TEXT,
      audio_timestamp_ms INTEGER, source TEXT, annotation_id TEXT, created_at INTEGER);
    CREATE TABLE solutions (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, guess_who TEXT, guess_how TEXT,
      guess_why TEXT, is_correct INTEGER, who_match INTEGER, how_match INTEGER, why_match INTEGER, hints_used INTEGER,
      gave_up INTEGER, explanation TEXT, created_at INTEGER);
    CREATE TABLE hints (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, content TEXT, created_at INTEGER);
  `);
  db.prepare("INSERT INTO players VALUES (?,?,?,?,?,?,?)")
    .run("p1", "Ana", "easy", "10-11", null, null, 1778417000);
  db.prepare("INSERT INTO mysteries (id,player_id,category,difficulty,target_age_range,status,title,logic_structure_json,narrative_text,narrative_annotations,audio_path,cover_image_path,validation_passed,validation_attempts,validation_notes,failure_reason,created_at,ready_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("m1", "p1", "missing-pet", "easy", "10-11", "ready", "The Case",
      JSON.stringify({ central_question: "Who took it?", characters: [], true_solution: { who_did_it: "x", how: "y", why: "z" }, essential_clues: [], false_clues: [] }),
      "Once upon a time", JSON.stringify([{ type: "p", id: "1" }]), null, "covers/m1.png", 1, 1, null, null, 1778417645, 1778417651);
  // a failed mystery with null logic + null ready_at
  db.prepare("INSERT INTO mysteries (id,player_id,category,difficulty,status,validation_attempts,created_at) VALUES (?,?,?,?,?,?,?)")
    .run("m2", null, "locked-room", "hard", "failed", 3, 1778420000);
  db.prepare("INSERT INTO solutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("s1", "m1", "p1", "x", "y", "z", 1, 1, 1, 1, 0, 0, "Nice work", 1780575526);
  return db;
}

describe("runEtl SQLite → Postgres", () => {
  beforeEach(() => setupTestDb());

  it("transform helpers convert types correctly", () => {
    expect(toDate(1778417645)).toEqual(new Date(1778417645 * 1000));
    expect(toDate(null)).toBeNull();
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBoolN(null)).toBeNull();
    expect(toBoolN(0)).toBe(false);
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson(null)).toBeNull();
  });

  it("copies all rows with correct count parity", async () => {
    const sqlite = makeFixtureSqlite();
    const report = await runEtl(sqlite, getDb() as any);
    sqlite.close();
    const by = Object.fromEntries(report.map((r) => [r.table, r]));
    expect(by.players).toMatchObject({ source: 1, inserted: 1 });
    expect(by.mysteries).toMatchObject({ source: 2, inserted: 2 });
    expect(by.solutions).toMatchObject({ source: 1, inserted: 1 });
    expect(by.clues).toMatchObject({ source: 0, inserted: 0 });
    expect(by.hints).toMatchObject({ source: 0, inserted: 0 });
  });

  it("preserves created_at (not now()) and converts jsonb + booleans", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any);
    sqlite.close();
    const db = getDb();
    const [m] = await db.select().from(mysteries).where(eq(mysteries.id, "m1")).limit(1);
    expect(m.created_at).toEqual(new Date(1778417645 * 1000)); // preserved, not now()
    expect(m.ready_at).toEqual(new Date(1778417651 * 1000));
    expect(m.logic_structure_json).toMatchObject({ central_question: "Who took it?" }); // jsonb object
    expect(m.validation_passed).toBe(true);
    const [m2] = await db.select().from(mysteries).where(eq(mysteries.id, "m2")).limit(1);
    expect(m2.logic_structure_json).toBeNull(); // null TEXT → null jsonb
    expect(m2.ready_at).toBeNull();
    const [s] = await db.select().from(solutions).where(eq(solutions.id, "s1")).limit(1);
    expect(s.is_correct).toBe(true);
    expect(s.gave_up).toBe(false);
    const [p] = await db.select().from(players).where(eq(players.id, "p1")).limit(1);
    expect(p.created_at).toEqual(new Date(1778417000 * 1000));
  });

  it("refuses to load into a non-empty target without --truncate", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any); // first load OK
    const sqlite2 = makeFixtureSqlite();
    await expect(runEtl(sqlite2, getDb() as any)).rejects.toThrow(/not empty/i);
    sqlite.close();
    sqlite2.close();
  });

  it("re-loads cleanly with truncate", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any);
    const report = await runEtl(makeFixtureSqlite(), getDb() as any, { truncate: true });
    expect(report.find((r) => r.table === "players")).toMatchObject({ inserted: 1 });
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @mysterio/server exec vitest run scripts/migrate-sqlite-to-pg.test.ts`
Expected: all cases PASS. If the no-double-load guard's count query (`tx.execute`) returns a shape
other than a bare array, adjust the `runEtl` count reads (Task 1 note) until green — the test is the
oracle. If pg-mem rejects `TRUNCATE ... RESTART IDENTITY CASCADE`, simplify to
`TRUNCATE TABLE hints, solutions, clues, mysteries, players CASCADE` (our PKs are text, no identities)
and note it.

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/migrate-sqlite-to-pg.test.ts
git commit -m "3b-ii: ETL integration test — parity, jsonb/boolean/timestamp transforms, load rails"
```

---

## Task 3: Fix `seed-players.ts` (async + empty-DB guard)

**Files:**
- Modify: `apps/server/scripts/seed-players.ts`

**Why:** the current script uses sync `.run()` (removed in 3b-i) so `db:seed` throws; `deploy.sh`
masks it with `|| true`. It also inserts demo players `p1`/`p2`. We fix it to async and make it
**only seed when the players table is empty**, so post-cutover deploys never add demo players to the
migrated production set.

- [ ] **Step 1: Rewrite seed-players.ts**

```ts
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { players } from "../src/db/schema.js";

async function main(): Promise<void> {
  const db = getDb();
  const [{ n }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM players`);
  if (Number(n) > 0) {
    console.log(`players table already has ${n} row(s) — skipping seed (empty-DB only).`);
    process.exit(0);
  }
  const rows = [
    { id: "p1", name: "Player One", default_difficulty: "easy" as const },
    { id: "p2", name: "Player Two", default_difficulty: "medium" as const },
  ];
  await db.insert(players).values(rows).onConflictDoNothing();
  console.log("seeded", rows.length, "players");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```

> If `db.execute<{n}>(...)` returns `{ rows }` rather than a bare array on the installed drizzle
> version, use `(await db.execute(...)).rows[0]`. Match whatever Task 1/2 settled on for the same call.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 3: Manually sanity-check against the local docker PG (optional but recommended)**

```bash
docker compose up -d   # or a throwaway PG; if 5432 is taken locally, use your dry-run PG from Task 5
DATABASE_URL=postgresql://mysterio:mysterio@localhost:5432/mysterio pnpm --filter @mysterio/server db:migrate
DATABASE_URL=postgresql://mysterio:mysterio@localhost:5432/mysterio pnpm --filter @mysterio/server db:seed   # seeds 2 (empty)
DATABASE_URL=postgresql://mysterio:mysterio@localhost:5432/mysterio pnpm --filter @mysterio/server db:seed   # skips (non-empty)
```
Expected: first run "seeded 2 players"; second run "already has 2 row(s) — skipping". Tear down after.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed-players.ts
git commit -m "3b-ii: fix seed-players to async pg + empty-DB guard (no prod clobber)"
```

---

## Task 4: Cutover runbook + provisioning doc

**Files:**
- Create: `docs/runbooks/postgres-cutover.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/postgres-cutover.md` with the exact, ordered procedure. Use this content
verbatim (fill the generated password at run time; never commit it):

````markdown
# Runbook: SQLite → Postgres production cutover (Spec 3b-ii)

Prereqs: 3b-ii merged to `main`; the local **dry-run (Task 5) is green**. VM = `panther-golem.exe.xyz`
(Ubuntu 24.04, passwordless sudo). Live SQLite = `~/mysterio/data/mysterio.db`. No active users.

## A. Provision Postgres (one-time)
```bash
ssh panther-golem.exe.xyz
sudo apt-get update && sudo apt-get install -y postgresql      # PG 16, postgresql.service enabled
PW="$(openssl rand -hex 16)"                                    # generated; do NOT commit
sudo -u postgres psql -c "CREATE ROLE mysterio LOGIN PASSWORD '$PW';"
sudo -u postgres createdb -O mysterio mysterio
psql "postgresql://mysterio:$PW@localhost:5432/mysterio" -c "SELECT 1;"   # connectivity check
# Append DATABASE_URL to the server env (keep existing keys):
printf '\nDATABASE_URL=postgresql://mysterio:%s@localhost:5432/mysterio\n' "$PW" >> ~/mysterio/apps/server/.env
```

## B. Sync code (NOT deploy.sh's migrate/seed/restart tail)
From your laptop:
```bash
pnpm --filter @mysterio/shared build && pnpm --filter @mysterio/server build && pnpm --filter @mysterio/web build
rsync -avz --delete --exclude '.git' --exclude 'node_modules' --exclude 'data' --exclude '.env' \
  --exclude '*.tsbuildinfo' --exclude '.DS_Store' ./ panther-golem.exe.xyz:~/mysterio/
ssh panther-golem.exe.xyz 'cd ~/mysterio && pnpm install --frozen-lockfile && pnpm --filter @mysterio/server build'
```

## C. Cutover (maintenance window — app down)
```bash
ssh panther-golem.exe.xyz
cd ~/mysterio
systemctl --user stop mysterio                                  # window begins
cp data/mysterio.db data/mysterio.db.bak-$(date +%Y%m%d-%H%M%S) # backup (SQLite never mutated)
pnpm --filter @mysterio/server db:migrate                       # create empty PG schema
pnpm --filter @mysterio/server db:etl -- --sqlite ~/mysterio/data/mysterio.db   # load data; prints parity report
# (db:seed deliberately SKIPPED — real players come from the ETL)
systemctl --user start mysterio                                 # window ends — now on Postgres
```

## D. Validate
```bash
# on the VM:
psql "$DATABASE_URL" -c "SELECT 'players',count(*) FROM players UNION ALL SELECT 'mysteries',count(*) FROM mysteries UNION ALL SELECT 'clues',count(*) FROM clues UNION ALL SELECT 'solutions',count(*) FROM solutions UNION ALL SELECT 'hints',count(*) FROM hints;"
# expect 6 / 24 / 1 / 1 / 0
pg_dump "$DATABASE_URL" > ~/mysterio/data/pg-postcutover-$(date +%Y%m%d-%H%M%S).sql   # snapshot
```
From your laptop: `curl -fsS https://panther-golem.exe.xyz/api/health` → `{"ok":true,"db":true}`;
`curl -fsS https://panther-golem.exe.xyz/api/players` → 6 players with `reputation`. Then the iPad pass
(mystery list shows 21 ready; the one solved case's trophy renders).

## E. Rollback (if validation fails)
The SQLite DB is untouched. Point the app back at SQLite:
```bash
git -C ~/mysterio checkout 6f0ff19   # pre-3b-i (SQLite) build  — OR redeploy that tag from laptop
# ensure .env DATABASE_PATH still points at ../../data/mysterio.db (it does)
cd ~/mysterio && pnpm install --frozen-lockfile && pnpm --filter @mysterio/server build
systemctl --user restart mysterio
```
Then investigate the ETL failure offline against the `.bak` copy.
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/postgres-cutover.md
git commit -m "3b-ii: Postgres cutover runbook (provision + sync + cutover + validate + rollback)"
```

---

## Task 5: Gated dry-run against a copy of the live database

**Files:** none (verification only — this is the correctness gate before any VM cutover).

> This task pulls a **read-only copy** of the live SQLite DB and runs the ETL into a local throwaway
> Postgres. It writes nothing to the VM. Run it from your laptop.

- [ ] **Step 1: Pull a copy of the live DB**

```bash
scp panther-golem.exe.xyz:~/mysterio/data/mysterio.db /tmp/mysterio-live.db
```

- [ ] **Step 2: Start a local throwaway Postgres**

(The repo `docker-compose.yml` uses 5432; if that's taken locally, use a throwaway on 5433.)
```bash
docker rm -f mysterio-dryrun 2>/dev/null
docker run -d --name mysterio-dryrun -e POSTGRES_USER=mysterio -e POSTGRES_PASSWORD=mysterio -e POSTGRES_DB=mysterio -p 5433:5432 postgres:16
until docker exec mysterio-dryrun pg_isready -U mysterio; do sleep 1; done
```

- [ ] **Step 3: Migrate + run the ETL against the copy**

```bash
export DATABASE_URL="postgresql://mysterio:mysterio@localhost:5433/mysterio"
pnpm --filter @mysterio/server db:migrate
pnpm --filter @mysterio/server db:etl -- --sqlite /tmp/mysterio-live.db
```
Expected: parity report `players: source=6 inserted=6`, `mysteries: 24/24`, `clues: 1/1`,
`solutions: 1/1`, `hints: 0/0`, then `ETL complete — counts match.`

- [ ] **Step 4: Spot-check the loaded data in Postgres**

```bash
docker exec mysterio-dryrun psql -U mysterio -d mysterio -c "SELECT status, count(*) FROM mysteries GROUP BY status;"   # ready 21, failed 3
docker exec mysterio-dryrun psql -U mysterio -d mysterio -c "SELECT id, created_at, ready_at FROM mysteries WHERE ready_at IS NOT NULL LIMIT 2;"  # real dates, not today
docker exec mysterio-dryrun psql -U mysterio -d mysterio -c "SELECT id, is_correct, gave_up, jsonb_typeof(logic_structure_json) AS logic FROM solutions JOIN mysteries USING(mystery_id) LIMIT 1;"  # is_correct t, logic 'object'
docker exec mysterio-dryrun psql -U mysterio -d mysterio -c "SELECT count(*) FROM players;"   # 6
```
Verify: `created_at` reflects the original 2026 epoch (not today's date), `is_correct` is boolean `t`,
`logic_structure_json` is a jsonb `object`. This proves the transforms on real data.

- [ ] **Step 5: Tear down**

```bash
docker rm -f mysterio-dryrun
rm -f /tmp/mysterio-live.db
```

- [ ] **Step 6: Record the dry-run result**

```bash
git commit --allow-empty -m "3b-ii: dry-run green against live-DB copy (6/24/1/1/0, transforms verified)"
```

---

## Out of scope (user-triggered, not part of the build)

The **actual production cutover** (runbook §A–E against the live VM) is a live operation the user
triggers — it provisions Postgres on the VM, loads real data, and flips the app. It's free of
LLM/image cost but it touches production, so it runs only on the user's go-ahead (with the
implementer assisting), followed by the user's iPad validation.

## Self-Review

**Spec coverage:** ETL script + transforms + rails → Task 1; test → Task 2; dry-run → Task 5;
provisioning + cutover runbook + rollback → Task 4; seed idempotency → Task 3; validation →
runbook §D + Task 5. All spec §1–6 + acceptance criteria mapped. ✅

**Placeholder scan:** `<pw>`/`$PW`/`$(date ...)` are runtime-generated values, not gaps; every code
step has full content. No TBD/TODO. ✅

**Type consistency:** `runEtl(sqlite, db, opts)`, `EtlReport`, `toDate/toBool/toBoolN/parseJson`
used identically in Task 1 (def), Task 2 (test), and Task 5 (CLI via `db:etl`). The `tx.execute`
count-shape wrinkle is flagged once and referenced consistently in Tasks 1/2/3. ✅

**Watch-items for implementers:** (1) drizzle `execute` return shape (array vs `{rows}`) — settle in
Task 1, reuse in Task 3; (2) pg-mem `TRUNCATE` syntax — simplify if rejected (Task 2); (3) if
tsconfig excludes `scripts/`, rely on the Task 2 vitest run (esbuild) as the compile+behavior oracle.
