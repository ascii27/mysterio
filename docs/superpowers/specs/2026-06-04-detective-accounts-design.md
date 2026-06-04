# Detective Accounts & Shared-Story Model — Design Spec (Spec 2a)

_Date: 2026-06-04 · Status: approved for planning · First of three sub-specs
decomposed from "Spec 2: Character creation + age"._

## Context

"Spec 2: Character creation + age" from the Maple Hollow Casebook handoff grew, on
inspection, into several subsystems. It was decomposed into three sequential
sub-specs, each its own design → plan → build cycle:

- **2a — Detective accounts & shared-story data model** (this spec): create/delete
  detectives; make generated stories a shared pool; per-(detective, story) progress;
  reverse the M5a name-baking so prose is detective-agnostic.
- **2b — Age-range → generation**: thread the detective's age range into the logic +
  narrative prompts (in-story detective age, vocabulary/sentence complexity, clue
  subtlety); store + display a "written for ages X–Y" badge (`target_age_range` on the
  mystery).
- **2c — Avatar image generation**: turn the detective's avatar **description text** into
  a generated avatar image, editable + regenerable (reuses the Spec 1b `gpt-image-1`
  image pipeline, but mutable/on-demand rather than immutable like covers).

This spec (2a) is the structural foundation the other two build on. It is the
biggest/riskiest of the three (a data-model change), so it goes first.

### What the user asked for (clarified)

- **Detectives are the players** — lightweight accounts. Kids create characters unique to
  them. Seeded detectives must be **removable**. Full account management is a future stage.
- **Stories are shared, progress is per-detective.** Every generated story is available to
  every detective, but detectives work **independently**: a solve, the kid's clue-tracker
  notes, and hints used are all per-(detective, story). "If a story is solved, it's only
  solved for that detective."
- **Stories are detective-agnostic.** The prose must not refer to the detective by name, so
  any detective can solve any story. (This reverses M5a, which baked the player's name into
  the prose as the detective.)
- **Age range, not exact age** (COPPA): store a band, not a birthdate. The age effect on
  generation + the visible target-age label are **2b**.
- **Avatar from description text** (the image generation itself is **2c**); 2a captures and
  stores the description.

## Codebase facts this design relies on

- DB is **SQLite** (Drizzle `sqliteTable`), not Postgres (the `CLAUDE.md` claim is stale).
  Migrations live in `apps/server/src/db/migrations/` (latest is `0002`, so this is `0003`).
- Current schema (`apps/server/src/db/schema.ts`):
  - `players` = `{ id, name, default_difficulty ('easy'|'medium'|'hard'), created_at }`.
  - `mysteries.player_id` is `NOT NULL` and is treated as the **owner** (the list filters by
    it). Story content (logic/narrative/cover) lives on the row.
  - `clues`, `solutions`, `hints` are keyed to `mystery_id` only. `solutions` is
    `UNIQUE(mystery_id)` — today only **one solve per story**, not per kid. `clues` has a
    `UNIQUE(mystery_id, annotation_id)` dedupe index.
- Routes: `GET /players` (no create/delete yet); `GET /mysteries?player_id=X` filters by
  owner; `POST /mysteries` takes `player_id` (creator) + category + difficulty;
  `GET /mysteries/:id`; clue/solve/hint routes are scoped by `mystery_id` only.
- **Auth posture:** there is no real auth. The `Authorization: Bearer device_<uuid>` idea in
  `CLAUDE.md` was never built; the app selects a detective **client-side** and passes
  `player_id` explicitly as a request parameter. 2a keeps this "light" model.
- M5a (`logicStructure.system.ts:56`) forces the detective character's name to equal the
  player's name and the orchestrator passes `playerName` into generation. 2a reverses this.

## Goals

- Let kids **create and delete** detectives (lightweight accounts; seeded ones removable).
- Make generated stories a **shared pool**, with **per-(detective, story)** progress for
  **solve outcome, clue-tracker notes, and hints**.
- Make generated prose **detective-agnostic** (second-person "you", no baked-in name).
- Capture **age range** (band) and an **avatar description** on each detective (consumed by
  2b and 2c respectively).
- Do this as an **incremental evolution** of the existing tables/routes (Approach A below),
  not a from-scratch rewrite.

## Non-Goals

- No age→generation tuning, no `target_age_range`, no age badge, no in-story age (**2b**).
- No avatar **image** generation, no `avatar_image_path`, no regenerate (**2c**).
- No real authentication / login / multi-device account sync (future stage).
- No reputation, ranks, trophies, or per-play stats surface (**Spec 3**).
- No backfill of legacy M5a stories to remove their baked-in detective name (accepted; test
  data on a disposable VM).
- No rename of the internal `players` table to `detectives` (churn; the UI already says
  "Detective"). Revisit at the full account-management stage.

## Design

### Approach (locked with the user)

**Approach A — scope-in-place.** Add a `player_id` dimension to the existing
`clues`/`solutions`/`hints` tables and reinterpret `mysteries.player_id` as a nullable
creator; derive per-detective status rather than introducing a junction/“play” table.
Chosen over (B) an explicit `detective_mystery` junction and (C) a full content/play-table
split because it meets every requirement with the least churn. **The model will be split
further (toward C) in a future stage** — noted in Future, below — when Spec 3's
ranks/trophies need richer per-play stats.

### 1. Data model & migration (`0003`)

**`players` (detectives)** — add:
- `age_range TEXT NOT NULL` with `CHECK (age_range IN ('8-9','10-11','12-13'))`. Existing
  seeded rows backfill to `'10-11'`; every new creation sets it explicitly.
- `avatar_description TEXT` (nullable) — the free text the kid types. Image generation +
  `avatar_image_path` are **2c**.

**`mysteries`** — `player_id` becomes a **nullable creator** with `ON DELETE SET NULL`
(provenance only; no longer an ownership filter). Story content stays shared on the row.

**`clues`, `solutions`, `hints`** — each gains
`player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE`, so every note/hint/solve
belongs to a (detective, story) pair:
- `solutions`: `UNIQUE(mystery_id)` → `UNIQUE(mystery_id, player_id)` (one solve per detective
  per story).
- `clues`: dedupe index `(mystery_id, annotation_id)` → `(mystery_id, player_id, annotation_id)`
  (two detectives can each auto-add the same annotation pill independently).
- add `(mystery_id, player_id)` indexes on `clues` and `hints`.

**Delete semantics:** deleting a detective **cascades their** clues/solutions/hints and
**nulls** the creator on any stories they generated — shared stories and other detectives'
progress survive.

**⚠️ Migration mechanics (flagged for the plan, not the design):** SQLite cannot add a
`NOT NULL` FK column to a populated table via a plain `ALTER`, and `player_id` needs a
**backfill** (existing rows → the owning mystery's creator). `0003` will therefore be a
**hand-augmented** Drizzle migration: the generated table-rebuild SQL plus
`UPDATE/INSERT…SELECT` backfill joining `mysteries`. Order the rebuilds so `mysteries`
creator nullability lands before the child-table backfills read it. Fallback, acceptable
because the VM holds disposable test data: a one-time reset of `clues`/`solutions`/`hints`.
The plan must pick one and verify `db:migrate` runs clean.

### 2. Detective-agnostic generation (reverses M5a)

- **`logicStructure.system.ts`:** the detective character becomes generic and second-person —
  name literally `"You"`, described in second person ("You're the detective on this case —
  curious, observant, notebook always in hand"), still never the culprit. **Remove** the
  "name MUST match the player's name" rule. Make the detective **age-neutral here** (drop the
  hardcoded "age 10"); concrete age is 2b.
- **Orchestrator (`orchestrator.ts`):** stop fetching the player's name and stop passing
  `playerName` into `runLogicStructureAgent`. `runLogicStructureAgent`'s input drops
  `playerName`. `POST /mysteries` keeps `player_id` only as the **creator**.
- **Why name it `"You"` rather than dropping the detective from the cast:** the BriefingCard
  and the M5b pill-annotation logic already special-case `role: "detective"` (label "You",
  never wrap it). Naming the character `"You"` keeps that logic working with zero churn.
- **BriefingCard:** unchanged in prose terms — it keeps showing "🕵️ You — Detective
  *{active detective's name}*" by reading the **active** detective client-side, not from the
  story.
- **Implication (accepted):** because a story is generated once and shared, the in-story
  detective is second-person "you" for everyone; there is no per-kid name inside the prose.

### 3. API

**Detectives (`players`):**
- `GET /players` — also returns `age_range` + `avatar_description`.
- **`POST /players`** (new) — body `{ name, age_range, default_difficulty, avatar_description? }`.
  Validation: `name` trimmed, 1–24 chars (duplicates allowed; `id` is the key);
  `age_range` ∈ the 3 bands; `default_difficulty` ∈ easy/medium/hard;
  `avatar_description` optional, ≤300 chars (bounds future image-prompt size), empty ⇒ null.
  Returns the created detective.
- **`DELETE /players/:id`** (new) — deletes the detective (DB cascade drops their progress,
  nulls their stories' creator). Allowed down to zero (UI then shows a create-first state).

**Mysteries:**
- `GET /mysteries?player_id=X` — **no longer filters by owner**. Returns the **shared pool of
  `ready` stories** to everyone, each annotated with *this* detective's status: `solved`
  (a solution row exists for `(mystery, X)`) and `started` (any clues/solve for `(mystery, X)`).
  **Non-ready stories (pending/generating/failed) are returned only to their creator** — so the
  kid who pressed generate sees their own spinner/failure, but half-built stories don't clutter
  everyone's list.
- `POST /mysteries` — unchanged inputs (`player_id` = creator, category, difficulty);
  generation is agnostic per §2.
- `GET /mysteries/:id?player_id=X` — shared content (title/prose/characters/cover) is identical
  for all detectives; the **per-detective bits (their notes, their hints, their solve status)
  are scoped to `player_id`**.

**Notes / hints / solve:** `POST /mysteries/:id/clues`, the solve endpoint, and the hints
endpoint each gain `player_id` so writes/reads are scoped to the active detective. Annotation
dedupe becomes per `(mystery, player, annotation)`. Re-solving a story by the same detective is
governed by the new `UNIQUE(mystery_id, player_id)` (existing solve logic, now per-detective).

### 4. Frontend

1. **PlayerPicker** ("Who's on the case today?") — add a **"+ New detective"** card and an
   **"Edit"** toggle that reveals a trash icon per detective with a confirm (kid-safe; no
   accidental deletes). Selecting a detective sets the active one (existing behavior).
2. **Create-detective form** (new screen/modal) — Name · Age range (8–9 / 10–11 / 12–13) ·
   Avatar description (textarea, optional, with a friendly example placeholder) · Difficulty.
   Submit → `POST /players` → select the new detective → main. Avatar renders the existing
   **monogram placeholder** for now (2c fills it from the description).
3. **Main story list** — renders the **shared pool** of ready stories with a **Solved ✓ / New**
   badge per story for the active detective. The "new mystery" generation flow is unchanged
   (attributed to the active detective as creator); the creator still sees their own non-ready
   stories until they go ready.
4. **Identity** — the main-page hero ("Welcome back, Detective Lily") and the BriefingCard read
   the active detective; they keep working.
5. **State** — `playerStore.activePlayerId` stays. Add create/delete react-query mutations. On
   load, **validate the stored active id** against `GET /players`; if it's gone (deleted on a
   shared backend), clear it and show the picker. Deleting the active detective clears the
   selection and returns to the picker (or the create-first state if none remain).

## Testing

- **Server (vitest) — the load-bearing tests are per-detective isolation:**
  - Detective A solves a story ⇒ `solved` for A, still unsolved for B.
  - A's clue-tracker notes and hints never appear in B's `GET /mysteries/:id` view.
  - Two detectives can each auto-add the same annotation pill (dedupe is per-detective).
  - `DELETE /players/:id` cascade: A's clues/solutions/hints are gone; the shared mystery
    survives (creator nulled); **B's** progress on that mystery is untouched.
- **Server — surface tests:** `POST /players` validation (rejects bad band, empty/over-long
  name, bad difficulty); `GET /mysteries?player_id` returns the shared `ready` pool annotated
  per detective and hides non-ready stories from non-creators; a prompt-content test that the
  LogicStructure system prompt no longer carries a player name (extends the existing
  `logicStructure.system.test.ts`).
- **Web:** `pnpm --filter @mysterio/web typecheck` + `vite build` (no web unit runner). Manual:
  create → switch → delete detectives; confirm Solved badges differ per detective.
- **Live (VM/iPad):** two detectives — generate as A, confirm B sees it in the shared pool and
  solves it independently without affecting A's status or notes.

## Acceptance criteria

- Kids can **create and delete** detectives; seeded detectives are removable; deleting down to
  zero shows a create-first state.
- Generated stories form a **shared pool**; **solve, notes, and hints are per-detective**, with
  isolation verified by the tests above.
- Generated prose is **detective-agnostic** (second-person "you", no baked-in name); the
  LogicStructure prompt no longer receives a player name.
- Each detective stores an **`age_range`** (band) and an optional **`avatar_description`**, ready
  for 2b and 2c.
- `db:migrate` runs clean (with the backfill) and the server boots; `typecheck`/tests/build are
  green on every commit.

## Risks / Notes

- **SQLite NOT-NULL-FK backfill** (§1) is the main implementation risk — flagged for the plan
  with a fallback.
- **Shared status derivation** — `started`/`solved` are derived from the presence of
  child rows rather than an explicit per-play record. Adequate for 2a; the explicit record
  arrives with the model split below.

## Future (deferred, noted per the user)

- **Migrate SQLite → PostgreSQL** as the backing store.
- **Full content/play model split** (Approach C): `mysteries` becomes content-only and a
  dedicated per-(detective, story) "play" record owns all progress — to land when Spec 3's
  reputation/ranks/trophies need richer per-play stats.
- Real **account management / auth** (login, multi-device sync) replacing the light client-side
  `player_id` model.

## Spec self-review

- **Placeholders:** none — no TBD/TODO; the one open mechanic (the `0003` backfill) is
  explicitly flagged as a plan-stage decision with a chosen primary and a fallback.
- **Internal consistency:** the data model (§1), the agnostic-generation change (§2), the API
  scoping (§3), and the frontend status/identity (§4) all reference the same per-`player_id`
  scoping and the same shared-`ready`-pool rule. Cascade/null semantics are stated once and
  reused.
- **Scope:** comfortably a single implementation plan (one migration + ~5 routes + ~3 frontend
  surfaces + prompt change). 2b and 2c are explicitly carved out.
- **Ambiguity:** "shared pool" is pinned to **`ready` stories only**, with non-ready visible to
  the creator — the one place it could have been read two ways.
