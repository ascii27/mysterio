# Spec 3c — Recurring Cast & Places + Generation — design

**Date:** 2026-06-08
**Status:** Approved (design); plan pending
**Branch (planned):** `feat/recurring-cast-3c`
**Part of:** the "Maple Hollow — World & Reputation" program (Spec 3), the **third** of five
sub-specs. Follows 3a (Reputation, PR #12) and 3b (Postgres: 3b-i PR #13 + 3b-ii cutover PR #14 —
**prod is now on Postgres**). Source vision: the Claude Design "Maple Hollow Casebook" prototype
(`mysterio-prototype/`, not in-repo; the World/Town/Who's-Who screens it mocked are realized by 3c–3e).

## Program context (where 3c sits)

| Sub-spec | What | Depends on | Status |
|---|---|---|---|
| 3a — Reputation & Trophy Room | ranks + difficulty-weighted points + Trophy Room | current data | ✅ shipped |
| 3b — Postgres migration | SQLite→Postgres self-host | — | ✅ shipped + cut over |
| **3c — Recurring cast & places + generation** ← _this spec_ | persistent characters/places; generation casts from a fixed roster; per-case appearances | 3b | this design |
| 3d — World surfaces | Town (cards + map), Who's Who, character/place detail + portraits | 3c | designed (companion) |
| 3e — HQ casebook desk | home reskin into manila-folder groups | 3a, 3c, 3d | designed (companion) |

3c is the **load-bearing, highest-risk** sub-spec: it changes the generation pipeline — the
"load-bearing part of the design" per `CLAUDE.md`. The whole World (3d/3e) is presentation built on
3c's data.

## The problem 3c solves

Today every mystery invents an ad-hoc cast **inside `logic_structure_json`** (the `characters[]`
array, with per-case `role`/`is_culprit`/`motive`). There is no persistent character or place — so a
"townsperson" never recurs, and cross-case identity (the same face/name across cases) is impossible.
The casebook image-gen spec explicitly **deferred** cross-case character identity to "the
recurring-cast / World model that doesn't exist yet." 3c builds that model.

## Decisions (locked with user, 2026-06-08)

1. **Roster origin — curated Maple Hollow seed.** Author a fixed town roster (~12–20 residents +
   ~8–12 places) as seed data; generation casts from it. The existing **24 legacy mysteries keep
   their embedded casts** and are **not** retrofitted into the roster (no appearances backfilled).
2. **Casting rule — mostly recurring + ≤1 occasional new.** Each case draws 4–6 townsfolk from the
   roster and may introduce **at most one** new resident, who is then **persisted** for future cases.
3. **World scope — one shared Maple Hollow.** `characters`/`places` are global, shared by all
   detectives. No `player_id` scoping (matches Spec 2a "shared stories").
4. **3c scope — data + generation + a minimal Who's Who list.** 3c ships the schema, seed,
   generation rewrite, the per-case appearance join, read APIs, **and** a bare read-only Who's Who
   list screen (early visible win). All richer World UI (Town, map, detail pages) **and character
   portrait generation** are 3d.
5. **Low-risk generation approach — keep `logic_structure_json` structurally unchanged + an
   extraction step** (see Architecture). We do **not** normalize characters out of the JSON; the
   solvability machinery keeps operating on the JSON unchanged.

## Goal

Give Maple Hollow a **persistent, shared cast and set of places**. Generation casts each new mystery
from this roster (mostly recurring faces, occasionally one new resident), records **which characters
appeared in which case and in what per-case role**, and sets the case in a known place — so the World
surfaces (3d) can show "who's who" and "where things happen," and the same townsperson can be a
suspect in one case and the culprit in another.

## Architecture

### Key principle: persistent identity vs. per-case role

The crux of the model is a clean split:

- **Persistent (in `characters`/`places`):** identity that never changes case-to-case — name,
  description, personality traits, portrait. **No** `is_culprit`, `role`, or `motive`.
- **Per-case (in `case_appearances`):** the role this character played **in this one mystery** —
  `role_in_case`, `is_culprit`, `motive`. The same person is innocent in one case, guilty in the next.

This makes recurrence safe: a recurring character carries identity, not guilt.

### Data model (new tables — Postgres, shared, no player scoping)

```
characters
  id                 text PK            -- kebab id, e.g. "old-man-hawthorne"
  name               text NOT NULL
  description        text NOT NULL      -- short bio for prompts + Who's Who
  traits             text               -- nullable; comma/phrase personality hints for generation
  portrait_image_path text              -- nullable; populated by 3d's portrait pipeline (NOT 3c)
  is_seed            boolean NOT NULL default false   -- true for curated seed residents
  created_at         timestamptz NOT NULL default now()

places
  id                 text PK            -- e.g. "maple-diner"
  name               text NOT NULL
  description        text NOT NULL
  image_path         text               -- nullable; 3d
  is_seed            boolean NOT NULL default false
  created_at         timestamptz NOT NULL default now()

case_appearances
  id                 text PK
  mystery_id         text NOT NULL REFERENCES mysteries(id) ON DELETE CASCADE
  character_id       text NOT NULL REFERENCES characters(id) ON DELETE CASCADE
  role_in_case       text NOT NULL      -- 'suspect' | 'witness' | 'bystander' (NOT 'detective' — that's the player)
  is_culprit         boolean NOT NULL default false
  motive             text               -- nullable; only meaningful when is_culprit
  created_at         timestamptz NOT NULL default now()
  UNIQUE (mystery_id, character_id)
  INDEX (character_id)                  -- "cases this person appears in"
  INDEX (mystery_id)
```

Plus on `mysteries`: add nullable `place_id text REFERENCES places(id) ON DELETE SET NULL` — the
place the case is set in. (Legacy 24 stay `NULL`.)

A new drizzle migration (additive `ADD COLUMN`/`CREATE TABLE` only — never rebuilds existing tables,
so no FK-cascade risk; PG `ADD COLUMN` is safe). The pg-mem test harness picks the new migration up
automatically (it applies all sorted migration files).

### Seed data (curated Maple Hollow)

A committed seed module (e.g. `apps/server/src/db/seed/mapleHollow.ts`) defining ~12–20 `characters`
and ~8–12 `places` with names, descriptions, and traits — a coherent small town (clockmaker, paperboy,
diner owner, librarian, mayor, etc.; the Diner, Library, Clocktower Square, etc.). Applied by an
idempotent, **empty-roster-guarded** seeder (`db:seed:world`, mirroring the `seed-players.ts`
empty-DB guard so re-deploys never duplicate). The seed is the canonical content; exact roster
authored during planning/implementation.

### Generation changes (the risky part — kept minimal)

`logic_structure_json` and its Zod schema stay **structurally unchanged**; the validation /
prose-solver / continuity-audit / narrative / distractor machinery operate on it **untouched**. Two
surgical changes to `orchestrator.ts` + `logicStructureAgent.ts`:

1. **Roster seeding (Phase 1 input).** Before `runLogicStructureAgent`, select a **cast pool** — 4–6
   roster characters + 1–2 candidate places (random/weighted selection; deterministic-enough for
   variety). Pass this pool into the logic prompt, instructing the model to **cast the suspects from
   the provided townsfolk** (reusing their exact `id`, `name`, `description`) and **set the case in
   one of the provided places**, and that it **may add at most one new resident** if the plot needs
   it. The emitted `characters[]` therefore carry roster ids for reused people; new people get a
   fresh kebab id. The detective remains the player-named detective (unchanged).

2. **Extraction step (at the `ready` transition).** After the case is finalized (logic validated +
   prose passes the readthrough gate), in the same place the orchestrator writes `status: "ready"`:
   - **Upsert new residents:** any `characters[]` entry (role ≠ detective) whose id is **not** in
     `characters` is inserted (identity only — name/description/traits; no role/culprit/motive).
     Capped at the ≤1-new rule; if the model over-invents, persist them all but `log` a soft warning
     (don't fail the case — the kid still gets a mystery).
   - **Write `case_appearances`:** one row per non-detective character with `role_in_case`,
     `is_culprit` (from `logic_structure_json`), `motive`.
   - **Set `mysteries.place_id`** to the matched roster place (by id; null if the model used a
     free-text setting that doesn't match a roster place — non-fatal).
   - All within the existing generation transaction/flow; **fail-soft** — extraction errors are
     logged but do not fail an otherwise-good mystery (the World linkage is enhancement, not
     correctness).

   This keeps the linkage **derived after the fact** from the canonical `logic_structure_json`, so
   the entire existing pipeline is undisturbed and the World tables are a projection of it.

### Solvability + fairness (unchanged guarantees, one new rule)

- Solvability is **unchanged**: the culprit must still be deducible from clues alone, enforced by the
  existing prose-solver + validation gate on `logic_structure_json`. Recurring identity is cosmetic
  and relational; per-case guilt is fresh.
- **New spoiler rule:** `case_appearances.is_culprit` for an **unsolved/open** case must **never** be
  exposed through any read API or the Who's Who. Appearance reads join against the player's solution
  state and **redact `is_culprit`/`motive` unless that player has solved (or given up on) that case**.
  Same principle as the redacted prose-solver — the World must not leak the answer.

### Read APIs (3c)

- `GET /api/characters` → roster list `{ id, name, description, portrait_image_path, appearance_count }`
  (appearance_count = number of cases the character appears in; spoiler-safe — count only).
- `GET /api/characters/:id` → identity + `appearances: [{ mystery_id, title, role_in_case,
  is_culprit? }]` where `is_culprit`/`motive` are **omitted unless the requesting player has resolved
  that case** (spoiler rule). Requires the player context (device-id auth already provides it).
- `GET /api/places` → places list `{ id, name, description, image_path }`.
- (3d extends these with portraits + place detail + richer shapes.)

### Minimal Who's Who list (3c's visible win)

One new read-only screen: a casebook-styled list of roster characters (name + short description +
**monogram/`SceneArt` fallback**, no portraits yet — portraits are 3d). Reachable from the home
screen via a simple link/button. No detail page, no map, no portraits in 3c.

## Components & boundaries

- `apps/server/src/db/schema.ts` — add `characters`, `places`, `case_appearances` pgTables +
  `mysteries.place_id`. One additive migration.
- `apps/server/src/db/seed/mapleHollow.ts` + `scripts/seed-world.ts` (`db:seed:world`,
  empty-roster-guarded).
- `services/generation/roster.ts` (new) — `selectCastPool()` (pick roster subset + places) +
  `extractAppearances()` (the post-`ready` upsert/link step). Unit-testable in isolation against
  pg-mem.
- `services/generation/prompts/logicStructure.system.ts` — add a "CAST FROM THE TOWN ROSTER" section
  + the ≤1-new rule; the cast pool is injected as prompt input.
- `services/generation/orchestrator.ts` — call `selectCastPool` before Phase 1; call
  `extractAppearances` at the `ready` transition (fail-soft).
- `routes/characters.ts`, `routes/places.ts` (new) — the read APIs, with the spoiler-redaction join.
- `packages/shared` — `Character`, `Place`, `CaseAppearance` DTO types.
- `apps/web` — minimal Who's Who list screen + api client + home-screen link.

## Testing

- pg-mem integration tests for `selectCastPool` (returns N roster chars + a place) and
  `extractAppearances` (upserts only NEW chars; writes appearances with correct per-case
  role/culprit/motive; sets place_id; idempotent/fail-soft).
- Spoiler-redaction test: `GET /characters/:id` hides `is_culprit` for an unsolved case, reveals it
  for a solved one.
- Seed idempotency test (empty-roster guard).
- A generation-path test (stubbed logic agent returning a cast that mixes 1 roster id + 1 new id →
  assert 1 upsert + 2 appearances + place_id set).
- Web: typecheck + vite build; Who's Who list renders from a mocked `/characters`.

## Non-goals (deferred)

- **Character portraits** + place images (3d — gpt-image-1, mirroring avatar/cover).
- **Town screen, map, character/place detail pages, full Who's Who** (3d).
- **Backfilling the legacy 24** into the roster (intentionally legacy).
- **Normalizing characters out of `logic_structure_json`** (kept as canonical; World tables are a
  projection).
- **Roster CRUD / admin UI** (seed is code; new residents come only from generation).
- **HQ desk / folder home** (3e).

## Open questions (surface, don't silently decide)

- **Cast-pool selection weighting:** pure random vs. favor under-used residents (for even spotlight).
  Recommend simple random for v1; revisit if the town feels lopsided.
- **Over-invention guard:** hard-cap new residents at 1 (reject/retry) vs. soft-persist-all-with-warn.
  Recommend soft for v1 (never fail a good mystery on a World-linkage nicety).
- **Name collision:** model reuses a roster *name* but a new *id* (or vice-versa). Recommend matching
  on `id` only; mismatched-name reuse is treated as a new resident + logged.

## Acceptance criteria

1. New tables + `place_id` migrate clean on real PG and pg-mem; seeder populates the curated roster
   and is empty-guarded.
2. A freshly generated mystery casts ≥3 suspects from the seed roster, sets a roster `place_id`, and
   writes correct `case_appearances` (per-case role/culprit/motive); ≤1 new resident persisted.
3. The existing solvability gate is unchanged and still green (validation pass-rate suite unaffected).
4. `GET /characters/:id` is spoiler-safe (hides culprit on unsolved cases).
5. The minimal Who's Who list renders the roster on the deployed app; server suite + web build green.
