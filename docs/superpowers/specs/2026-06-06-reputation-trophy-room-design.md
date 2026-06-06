# Spec 3a — Reputation & Trophy Room — design

**Date:** 2026-06-06
**Status:** Approved (design); plan pending
**Branch (planned):** `feat/reputation-trophy-room`
**Part of:** the "Maple Hollow — World & Reputation" program (Spec 3), the first of five
sub-specs. Source design: the Claude Design handoff prototype
(`mysterio-prototype/`, `data.js` + `screens-world.jsx`).

## Program context (where 3a sits)

The "Full World" prototype was decomposed into five sequential sub-specs, each its own
design → plan → build:

| Sub-spec | What | Depends on | Postgres | Risk |
|---|---|---|---|---|
| **3a — Reputation & Trophy Room** ← _this spec_ | ranks + difficulty-weighted points + Trophy Room | current data only | No | Low |
| 3b — Postgres migration | SQLite→Postgres (self-host on VM) | — | _is_ the migration | Med |
| 3c — Recurring cast & places + generation | persistent characters/places; generation casts from a fixed roster; per-case appearances | 3b | needs PG | High |
| 3d — World surfaces | Town (cards + map), Who's Who, character/place detail cross-linking | 3c | needs PG | Med |
| 3e — HQ casebook desk | home reskin into manila folder groups (Open / Closed / People / Places) | 3a, 3c, 3d | needs PG | Med |

3a is the one piece independent of the World — no generation changes, no Postgres — so it
ships visible value first while the heavier World chain (3b–3e) lines up.

## Goal

Give each detective a **reputation** that grows as they solve cases, expressed as
difficulty-weighted **points** that promote them up a ladder of named **ranks**, and a
**Trophy Room** that displays the cases they've solved. Surface rank on the home screen and
the player picker.

## Decisions (locked with user)

- **Scoring — "Gentle".** A correct solve awards points by the mystery's difficulty:
  `easy +1, medium +2, hard +3`. Ranks promote at **geometrically growing** point
  thresholds (each gap doubles the previous):

  | Rank | Threshold (points to reach) | Gap from previous |
  |---|---|---|
  | Rookie | 0 | — |
  | Junior Sleuth | 3 | 3 |
  | Detective | 9 | 6 |
  | Master Detective | 21 | 12 |

  (Master ≈ 7 hard cases / 21 easy.)
- **No penalty.** Progress only ever rises. A **wrong** final guess and a **give-up**
  ("I don't know") both cost **nothing** — they simply don't award points. (This reverses
  the prototype's −½-star wrong-guess penalty and the user's original "reputation decreases
  on failure", chosen deliberately to keep it gentle for an 8-year-old.)
- **Everyone starts at Rookie 0.** No backfill of historical solves into a starting rank.
  (Falls out for free from the derived model — see below.) The Trophy Room still lists any
  pre-existing solved cases.
- **Surfaces (all three):** a rank card on the home screen (MainScreen), a rank chip on each
  PlayerPicker row, and a Trophy Room entry button on the home screen. The Trophy Room itself
  is a new screen.

## Key architectural consequence: fully derived, zero migration

Because progress only rises (no penalty, no resets), reputation is a **pure function of the
detective's correct solutions** — order-independent:

```
points(player) = Σ over { solutions where player_id = P and is_correct = 1 }
                   of  DIFFICULTY_POINTS[ mystery.difficulty ]
rank(player)   = the highest RANK whose threshold ≤ points(player)
```

So 3a needs **no new columns, no stored counters, and no DB migration** — reputation is
computed on read from the existing `solutions` ⋈ `mysteries.difficulty`. A fresh detective
has zero correct solutions → 0 points → Rookie, automatically (this is why "start at
Rookie 0" needs no backfill code).

> Trade-off noted: if a wrong-guess **penalty** is ever reintroduced, pure derivation breaks
> (floor + sticky-rank + order dependence would need a stored, transactionally-updated
> counter). We are explicitly no-penalty now, so we derive. Revisit only if the penalty
> returns. (YAGNI.)

## Components

### 1. `packages/shared` — the rank model (single source of truth)

A new module (e.g. `src/constants/reputation.ts`) consumed by **both** server (to compute)
and web (to display), so the ladder can never drift between them:

- `DIFFICULTY_POINTS: Record<DifficultyId, number>` = `{ easy: 1, medium: 2, hard: 3 }`.
- `RANKS`: ordered array of `{ id, name, threshold, medal }` — Rookie@0, Junior Sleuth@3,
  Detective@9, Master Detective@21. Medal colors carried over from the prototype
  (`#c98a5b` bronze / `#c9cdd6` silver / `#e8b04b` gold / `#7fd1ff` blue).
- `reputationFor(points: number): ReputationSummary` returning
  `{ rank_index, rank_name, points, next_threshold | null, points_to_next | null,
  progress_fraction }`. `progress_fraction` is 0–1 within the current rank's gap; at Master
  (terminal) `next_threshold`/`points_to_next` are `null` and `progress_fraction` is `1`.
- Unit tests pin the boundaries: 0 → Rookie; 2 → Rookie; 3 → Junior Sleuth; 8 → Junior
  Sleuth; 9 → Detective; 21 → Master; 100 → Master (terminal, nulls).

### 2. Server

- **Extend `GET /players`** so each returned player carries a computed `reputation`
  (`ReputationSummary`) alongside the existing row fields. One grouped query over correct
  solutions joined to their mysteries' difficulties → points per player → `reputationFor`.
  This powers **both** the home rank card and the picker chips with **no new endpoint**.
  (The single-player `GET`/`PATCH`/`POST avatar` responses may also include `reputation`
  for consistency; the list endpoint is the load-bearing one.)
- **New `GET /players/:id/trophies`** → solved cases for the detective
  (`solutions.is_correct = 1` and `mysteries.status = 'ready'`), each as
  `{ mystery_id, title, cover_image_path, difficulty, solved_at, culprit_name, how }`,
  ordered newest-first by `solved_at` (the solution's `created_at`). The server parses
  `mysteries.logic_structure_json` and resolves `true_solution.who_did_it` → the matching
  `characters[].name` for `culprit_name`, and passes through `true_solution.how`. This is
  spoiler-safe: the case is already solved by this detective. Raw `logic_structure_json` is
  **not** shipped to the client — only the two resolved fields.
- Tests: points math over a seeded solve set (mix of difficulties + a wrong + a give-up that
  must not count); trophies response shape + culprit-name resolution; player with no solves
  → Rookie 0 and empty trophies.

### 3. Web

- **`RankBadge`** — a new shared casebook component (`components/casebook/`): a medal disc
  colored by `RANKS[rankIndex].medal`, sized via a prop. Used by the home card and the
  Trophy Room header.
- **MainScreen rank card** — replaces the current "Welcome back / Detective {name}" hero
  block with: `RankBadge` + rank name + a progress meter (fill = `progress_fraction`) +
  "*{points_to_next} more to {next rank}*" (or a "Top rank!" treatment at Master) + a small
  "{N} solved" line. Keeps the detective's name. Reads `reputation` from the existing
  `["players"]` query (no new fetch).
- **PlayerPicker rank chip** — a small rank-name chip on each detective row, reading the same
  `reputation` from `listPlayers`. Sibling element to the existing avatar/name/delete layout
  (no nested-button regression per `reference_web_delete_gotchas`).
- **Trophy Room** — new route `/trophies` (registered in `routes.tsx` like `/settings`),
  opened by a "🏆 Trophy Room" button on MainScreen. Layout recreates the prototype's
  `TrophyRoom` + `TrophyDetail` in the live casebook style:
  - Header: `RankBadge` + "{N} solved" + rank name + "Detective {name}".
  - Grid of solved-case cards (cover image with a ✓ stamp, title, solved date).
  - Empty state when there are no solves ("Your shelf is waiting. Solve your first case to
    earn a trophy!").
  - Tap a card → a `TrophyDetail` bottom-sheet drawer: cover, title, solved date, difficulty
    pill, the culprit **name**, and the **how**. (No culprit portrait — characters are
    per-mystery and have no generated images yet; portraits arrive with the 3c World work.)

## Out of scope (later sub-specs / deferred)

- Postgres (3b); recurring cast / Town / Who's Who / character & place detail (3c, 3d); the
  HQ manila folder-desk home layout (3e).
- Wrong-guess penalty and stored progression counters (would only be needed if the penalty
  returns).
- Any change to the generation pipeline, settings gating, or the solve/give-up flow itself —
  3a only *reads* the outcomes those already record.
- Culprit portraits in the Trophy Room (needs the 3c recurring-cast image model).

## Testing

- **Per-change gate (no LLM/image cost):** `packages/shared` `vitest`; `apps/server`
  `vitest` + `typecheck`; `apps/web` `typecheck` + `vite build` (the web app has no unit/lint
  runner per `project_stack_facts_actual`).
- **Process:** subagent-driven (implementer → spec-review → code-quality review → fix →
  re-review), sonnet for implementer + reviewers, per the project workflow.
- **Then:** deploy to `panther-golem.exe.xyz` (the now-standard test step) → user iPad pass.
  No paid calls are required to validate 3a — solving real cases on the live app exercises it,
  but the math/screens can be confirmed against existing solved mysteries without new
  generation.

## Acceptance criteria

1. A correct solve on an easy / medium / hard mystery increases the detective's points by
   1 / 2 / 3; rank promotes when points cross 3 / 9 / 21.
2. A wrong final guess and a give-up both leave points unchanged.
3. The MainScreen rank card shows the badge, rank name, a progress meter, and "{N} more to
   {next rank}" (with a terminal treatment at Master).
4. Each PlayerPicker row shows the detective's current rank.
5. The Trophy Room lists the detective's solved cases (cover, title, date) with a working
   detail drawer showing culprit name + how, and an empty state when there are none.
6. Reputation is computed (no DB migration); a brand-new detective is Rookie with 0 points
   and an empty Trophy Room.
7. Gates green; the solve/give-up endpoints' existing behavior is unchanged.

## Estimated plan shape

~6–7 tasks: (1) shared rank model + tests; (2) server reputation on `GET /players` + tests;
(3) server trophies endpoint + tests; (4) `RankBadge` + MainScreen rank card; (5) PlayerPicker
rank chip; (6) Trophy Room screen + route + entry + detail drawer; (7) deploy + iPad
verification.
