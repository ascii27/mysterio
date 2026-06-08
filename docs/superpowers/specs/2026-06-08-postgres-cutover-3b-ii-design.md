# Spec 3b-ii — Postgres provisioning + data ETL + production cutover

**Date:** 2026-06-08
**Program:** Maple Hollow — World & Reputation (Spec 3), sub-spec 3b (second half)
**Status:** Design approved; ready for implementation plan

## Context

3b-i (merged to `main` via PR #13, merge `360e3a3`) ported all server code to Postgres
(`pg` + drizzle-node-postgres) and proved it gate-green + against a real Postgres 16 instance —
but **did not touch production**. The live VM still runs the pre-3b-i SQLite build. 3b-ii is the
production move: provision Postgres on the VM, copy the live data over, and cut the app to
Postgres. See [[project_spec3b_i_postgres_port]].

**Critical state note:** `deploy.sh` is now a one-way door — its `db:migrate` step needs a
Postgres `DATABASE_URL`, and the systemd process calls `getDb()` → pg Pool on boot. Running
`deploy.sh` before Postgres is provisioned would break the live site. So 3b-ii's cutover **is**
the next deploy and must provision + load + flip together.

## Verified live state (read-only recon, 2026-06-08)

**VM (`panther-golem.exe.xyz`):** Ubuntu 24.04.4 LTS · passwordless sudo · **Postgres not yet
installed** · Docker 29.1.3 + `sqlite3` CLI present · Node v22.11.0 · app runs as
`systemctl --user mysterio` (PID holds the DB open).

**Live SQLite DB:** the VM `.env` sets `DATABASE_PATH=../../data/mysterio.db` (relative to
`apps/server` workdir) → the real DB is **`~/mysterio/data/mysterio.db` (68 KB)**. (A 4 KB stray
at `~/mysterio/apps/server/data/mysterio.db` is abandoned — ignore it. The ETL must read the
`.env`-configured path, not the default.) `data/` is rsync-excluded in `deploy.sh`, so it
persists across deploys.

**Data shape (52 rows, clean):**
- players 6 · mysteries 24 (21 `ready`, 3 `failed`) · clues 1 · solutions 1 · hints 0.
- **No NULL `player_id` in any child table** → the NOT-NULL-FK legacy-row risk is moot; no
  remediation needed. 23 mysteries have a NULL *creator* `player_id` (nullable — copies as-is).
- Timestamps are **epoch-seconds integers** (e.g. `created_at=1778417645`).
- Booleans are **0/1 integers** (`is_correct=1`, `gave_up=0`, …).
- JSON columns (`logic_structure_json`, `narrative_annotations`) are TEXT JSON strings.
- SQLite schema is **fully at migration 0005** — every column matches the PG baseline
  (`mysteries` has all 19 cols incl. `target_age_range`/`narrative_annotations`/`cover_image_path`;
  `players` has `avatar_image_path`/`avatar_description`; `clues` has `source`/`annotation_id`).
  `__drizzle_migrations` holds 6 entries (0000–0005).

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| ETL tooling | Custom Node/TS script reading SQLite (better-sqlite3 devDep) → inserting via drizzle-pg |
| Downtime | Brief maintenance window acceptable (no active users; validate unhurried) |
| Postgres on VM | System `postgresql` via `apt` (Ubuntu 24.04 → PG 16); `postgresql.service` alongside `mysterio.service` |
| PG auth | Local password role: `postgresql://mysterio:<pw>@localhost:5432/mysterio` in VM `.env` |
| Dry-run | Mandatory gate: run ETL against a local copy of the live DB before touching the VM |
| Rollback | SQLite DB never mutated; on failure revert `.env` + redeploy pre-3b-i build (`6f0ff19`) |
| Scope | One spec / one plan (ETL script + cutover runbook + provisioning) |

## Design

### 1. ETL script — `apps/server/scripts/migrate-sqlite-to-pg.ts`

Re-add `better-sqlite3` as a **devDependency** (ETL-only; never imported by the running server).
The script:

- Opens the SQLite DB read-only at a path from `--sqlite <path>` (or `SQLITE_DB_PATH` env);
  connects to Postgres via the standard `getDb()` (`DATABASE_URL`).
- Copies tables in **FK-safe order**: players → mysteries → clues → solutions → hints.
- **Per-column transforms:**
  - `created_at` / `ready_at`: `Number` epoch-seconds → `new Date(secs * 1000)`. Set
    **explicitly** on every insert so the `DEFAULT now()` on `created_at` never overwrites the
    historical value. `ready_at` null → null.
  - booleans `is_correct` / `who_match` / `how_match` / `why_match` / `gave_up` /
    `validation_passed`: `0 → false`, `1 → true`, `NULL → null` (via `=== null ? null : x !== 0`).
  - jsonb `logic_structure_json` / `narrative_annotations`: `value == null ? null : JSON.parse(value)`.
  - text PKs, integers (`hints_used`, `validation_attempts`, `audio_timestamp_ms`), and all other
    columns: verbatim.
- **Safety rails:**
  - Refuses to run if any target table already has rows, unless `--truncate` is passed (then it
    `TRUNCATE`s all five in dependency order first). Prevents accidental double-load.
  - Prints a **per-table report**: `source_count` vs `inserted_count`. Exits non-zero if any pair
    mismatches.
  - On an unexpected NULL in a NOT-NULL target column (e.g. a child `player_id`), it **throws with
    the offending row id** rather than silently dropping. (Recon shows zero such rows today, but
    the guard stays.)
  - Wraps the whole load in a single transaction (all-or-nothing).

### 2. Dry-run (local, gating — no VM writes)

Before any VM action:
1. `scp panther-golem.exe.xyz:~/mysterio/data/mysterio.db /tmp/mysterio-live.db` (the live copy).
2. Start a local Postgres (the repo `docker-compose.yml`, or a throwaway container on a free port
   if 5432 is taken locally), point `DATABASE_URL` at it, run `db:migrate` (creates the baseline).
3. Run the ETL against `/tmp/mysterio-live.db`.
4. **Validate:** the report shows `6 / 24 / 1 / 1 / 0`; a `ready` mystery's `logic_structure_json`
   reads back as an object with its `central_question`; `created_at` matches the source epoch
   (converted), **not** `now()`; the one solution's `is_correct`/`gave_up` are correct booleans.

The dry-run is the real correctness gate — the VM cutover just replays a proven procedure.

### 3. VM Postgres provisioning (one-time)

On the VM:
- `sudo apt-get update && sudo apt-get install -y postgresql` → Postgres 16, `postgresql.service`
  enabled + started.
- Create the role + database (idempotently):
  `sudo -u postgres psql -c "CREATE ROLE mysterio LOGIN PASSWORD '<pw>';"` and
  `sudo -u postgres createdb -O mysterio mysterio`.
- Append `DATABASE_URL=postgresql://mysterio:<pw>@localhost:5432/mysterio` to
  `~/mysterio/apps/server/.env`. (`DATABASE_PATH` line left in place — env.ts ignores unknown
  keys.) The password is generated at provisioning time and never committed.

### 4. Cutover runbook (ordered, on the VM)

A documented runbook (`docs/runbooks/postgres-cutover.md`) — and/or a guarded
`scripts/cutover-to-postgres.sh`. **The cutover does NOT use `deploy.sh`'s bundled
migrate+seed+restart**, because that would `db:seed` into the empty PG *before* the ETL — seeding
demo players first would either poison the ETL's no-double-load rail or mix demo rows into the
real player set. Instead the runbook does, in order:
1. **Sync code only** to the VM (build + rsync + `pnpm install` + `pnpm --filter @mysterio/server
   build`) — the deploy mechanics *without* the migrate/seed/restart tail. Postgres must already
   be provisioned (step 3) and `DATABASE_URL` set.
2. `systemctl --user stop mysterio` (app goes down — maintenance window begins).
3. **Backup:** `cp ~/mysterio/data/mysterio.db ~/mysterio/data/mysterio.db.bak-<ts>` (the SQLite DB
   is never mutated by anything downstream).
4. `pnpm --filter @mysterio/server db:migrate` (creates the empty PG schema).
5. Run the ETL via a new package script: `pnpm --filter @mysterio/server db:etl -- --sqlite
   ~/mysterio/data/mysterio.db` — reads SQLite, loads PG in one transaction, prints the parity
   report. **`db:seed` is deliberately skipped during cutover** (the real players come from the
   ETL).
6. `systemctl --user start mysterio` (now on Postgres — window ends).
7. Verify (§5 below).

After cutover, normal `deploy.sh` runs are fine — `db:migrate` is idempotent against PG and
`db:seed` must be idempotent (§6) so it never duplicates the migrated players.

### 5. Validation + rollback

- **Validation:** `pg_dump` snapshot kept post-load; `psql` count parity (`6/24/1/1/0`);
  `/api/health` → `db:true`; `GET /api/players` → 6 players with `reputation`; mystery list shows
  the 21 `ready`; the one solved case's trophy renders. Then the user's **iPad pass**.
- **Rollback:** the SQLite DB + its `.bak` are untouched. On any failure, set the app back to
  SQLite by reverting the VM `.env` `DATABASE_PATH` usage and redeploying the pre-3b-i build
  (`git checkout 6f0ff19` → deploy). Cheap and safe at 52 rows with no active users.

### 6. deploy.sh / seed compatibility

Once Postgres is provisioned and `.env` has `DATABASE_URL`, `deploy.sh` works unchanged (its
`db:migrate` targets PG). The ETL is **one-time and not part of `deploy.sh`**. The plan must
verify `db:seed` (`scripts/seed-players.ts`) is idempotent (`onConflictDoNothing` on `players.id`)
so post-cutover deploys don't clobber or duplicate the 6 real players — and adjust it if not.

## Acceptance criteria

1. ETL script exists, is unit-tested where practical (transform helpers; a small fixtures-based
   round-trip against pg-mem or a Docker PG), and gated by the no-double-load + count-parity rails.
2. **Dry-run green** against a copy of the live DB: `6/24/1/1/0` parity, timestamps preserved,
   jsonb + booleans correct.
3. VM provisioning steps documented + runnable; `postgresql.service` active.
4. Cutover runbook complete and ordered, with backup + rollback steps.
5. `db:seed` confirmed idempotent (or fixed).
6. (Live action — user-triggered) Cutover executed; app on Postgres; validation + iPad pass green.

## Risks & mitigations

- **`DEFAULT now()` overwriting `created_at`** → ETL sets every timestamp explicitly; dry-run
  asserts source-epoch preservation. (Primary correctness risk.)
- **Wrong DB file** → ETL/runbook read the `.env`-configured path (`~/mysterio/data/mysterio.db`),
  never the default; recon documented the stray 4 KB file.
- **Double-load / partial load** → non-empty-target refusal + single transaction + count parity.
- **jsonb / boolean mis-transform** → dry-run spot-checks; failed mysteries' null logic handled.
- **deploy.sh seed clobber** → idempotency check in the plan.
- **Provisioning privilege** → confirmed passwordless sudo on the VM.

## Conventions

- Subagent-driven (`workflow_subagent_driven`): implementer → spec review → code-quality review
  per task; **sonnet** (`workflow_model_selection`).
- 3b-ii build + dry-run cost no LLM/image money. The only live/paid-adjacent action is the actual
  VM cutover, which is the user's call to trigger ([[feedback_deploy_for_ipad_testing]] — the iPad
  pass validates it).
