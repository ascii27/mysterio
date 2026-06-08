# Spec 3f — Open-ended Case Generation + One-tap Start — design

**Date:** 2026-06-08
**Status:** Approved (design); plan pending
**Branch (planned):** `feat/open-ended-generation-3f`
**Part of:** the "Maple Hollow — World & Reputation" program (Spec 3). Added after the original
five-spec decomposition. **Execution order: 3c → 3d → 3f → 3e** (3f runs after the world exists and
before the desk home, so 3e's "New case" affordance is 3f's single button).

## Program context (where 3f sits)

| Sub-spec | What | Status |
|---|---|---|
| 3a — Reputation & Trophy Room | ranks + points + Trophy Room | ✅ shipped |
| 3b — Postgres migration | SQLite→Postgres | ✅ shipped + cut over |
| 3c — Recurring cast & places + generation | persistent roster; generation casts from it (still within the fixed category + difficulty inputs) | designed |
| 3d — World surfaces | Town/map, Who's Who, detail + portraits | designed |
| **3f — Open-ended generation + one-tap Start** ← _this spec_ | remove the fixed category menu; AI invents the case; generate from player presets; single button | this design |
| 3e — HQ casebook desk | folder-grouped home; its "New case" action is 3f's button | designed |

3f is the **payoff** of the persistent world: once Maple Hollow has a cast and places (3c + 3d), a
case no longer needs a fixed-type menu — the AI can invent any case set in the town. 3c deliberately
keeps the existing `category` + `difficulty` inputs working; 3f is where we cut them over to
open-ended, preset-driven, one-tap generation.

## The problem 3f solves

Today the kid picks **1 of 4 fixed categories** (`missing-pet`, `haunted-mansion`,
`stolen-treasure`, `locked-room`) **and** a difficulty, then generates. After the world exists, that
menu is both unnecessary friction and a creative straitjacket. The product should be: **tap "Start a
new case" → the AI crafts a fresh Maple Hollow mystery tuned to this detective.**

## Decisions (locked with user, 2026-06-08)

1. **Open-ended case type.** The AI decides what kind of mystery to create. The **only** constraints:
   it is **set in Maple Hollow** and **involves at least one town character** (a roster resident).
   Cases are **independent** — no arcs, no required relationships between them.
2. **Generate from player presets + world.** Inputs are the player's saved **`default_difficulty`**
   (easy/medium/hard) + **`age_range`** (the Spec 2b age band) + the **world contents** (roster +
   places). **No** per-case category or difficulty selection.
3. **`category` → free-text `case_type` label.** Drop the fixed enum; the generator emits a short
   free-text case-type string (e.g. "sabotaged bake-off", "missing heirloom") used for display flavor
   + cover-art prompting. The `mysteries.category` column is already `text` — **no DB migration**;
   only the Zod enum + the few enum consumers change.
4. **One-tap UX.** The category grid and difficulty picker are removed from the generate flow,
   replaced by a single **"Start a new case"** button. The generate API becomes
   `POST /api/mysteries/generate { player_id }` — the server reads the player's presets.
5. **Future (explicit non-goal here):** eventually **auto-generate cases on a schedule** (e.g. weekly,
   up to a cap) and remove the manual button. 3f builds the one-button manual path and leaves the
   generation entry point structured so a scheduler can call it later; it does **not** build the
   scheduler.

## Goal

Collapse case creation to a single **"Start a new case"** button that asks the AI to invent a fresh
mystery set in Maple Hollow, involving at least one resident, calibrated to the detective's saved
skill level and age — no category menu, no difficulty picker.

## Architecture

### Generation (the core change)

Builds directly on 3c (which already casts suspects from the roster and runs the post-`ready`
extraction). 3f changes the **framing and inputs**, not the solvability machinery:

- **`logicStructure.system.ts`** — replace the per-category scenario framing with an **open-ended**
  instruction: *invent any kid-appropriate mystery set in Maple Hollow that involves at least one of
  the provided townsfolk and is set in one of the provided places.* Keep all existing fair-play /
  clue-seeding / distractor / detective-is-player rules. The cast pool + places from 3c are still
  injected; difficulty + age band still tune clue counts / vocab / subtlety (Spec 2b machinery is
  unchanged). Emit a free-text **`case_type`** (the themed label).
- **`craftGuidance.ts`** is **already category-agnostic** (general Christie fair-play advice) — no
  change needed there.
- **LogicStructure schema (`packages/shared`)** — replace the `category` enum with
  `case_type: z.string().min(3).max(60)` (free text). The schema's existing cross-field invariants
  (one culprit, one detective, fair-play central question, distractors) are unchanged. `CATEGORY_IDS`
  is retained **only** as a display lookup for the 24 legacy mysteries (which still hold the old enum
  values); new cases use free-text `case_type`.
- **A new generation constraint (≥1 resident):** enforce that at least one non-detective character in
  the case maps to a roster character (i.e., 3c's extraction writes ≥1 `case_appearance`). If the
  model fails to use any resident, treat it like a validation miss and regenerate with a corrective
  note (reusing the existing `previousFailureNotes` channel). This guarantees every case ties into
  the world.
- **Cover-image prompt (`coverImageAgent`)** — key off `case_type` + setting + cast instead of the
  fixed category.

### Generate API + presets

- **`POST /api/mysteries/generate`** body becomes `{ player_id }` only. The route reads
  `player.default_difficulty` and `player.age_range` and passes them into the orchestrator
  (difficulty + target age band). Drop `category`/`difficulty` from the request contract.
  - Debug override (optional, behind the existing debug surface): allow an explicit
    `{ difficulty?, case_type_hint? }` for the Settings/Debug panel only — never in the kid UX.
- The mystery row still stores `category` (now the free-text `case_type`) + `difficulty` (from the
  preset) + `target_age_range` (from the preset, per Spec 2b).

### UX

- Remove `CategoryGrid` and the difficulty selection from the generate flow.
- A single **"Start a new case"** button (interim placement on the current home / generate entry).
  Tap → `POST /generate { player_id }` → existing poll-until-ready flow → the case.
- 3e then places this exact button inside the desk's **Open cases** folder ("＋ New case"); 3f owns
  the behavior, 3e owns the final placement.
- A friendly **generating** state (the case is being "written up") — reuse the existing pending/poll
  UI.

### Solvability (unchanged)

The prose-solver + validation gate operate on `logic_structure_json` exactly as before. Open-ended
type selection does not touch fairness: the culprit must still be deducible from clues alone. The only
added gate is "≥1 roster resident appears," handled via the regenerate-with-notes loop.

## Components & boundaries

- `packages/shared/src/schemas/logicStructure.ts` — `category` enum → `case_type` free string;
  `CATEGORY_IDS` demoted to a legacy display lookup.
- `services/generation/prompts/logicStructure.system.ts` — open-ended framing; town + ≥1-resident +
  place constraints; emit `case_type`.
- `services/generation/orchestrator.ts` + the generate route (`routes/mysteries.ts`) — read presets;
  pass difficulty + age band; enforce ≥1-resident via the existing regen-notes loop.
- `services/generation/agents/coverImageAgent.ts` (+ prompt) — `case_type` + setting framing.
- `apps/web` — remove `CategoryGrid`/difficulty from the generate flow; add the "Start a new case"
  button + `generate({ player_id })` api client; map legacy `category` values for old-case display.

## Testing

- Schema test: `case_type` free-text accepted; legacy enum values still parse for display mapping.
- Generation-path test (stubbed logic agent): a case with **no** roster resident triggers a
  regenerate with a corrective note; a case with ≥1 resident passes and writes the appearance.
- Route test: `POST /generate { player_id }` reads the player's `default_difficulty` + `age_range`
  and rejects a body still sending `category`/`difficulty` (or ignores them outside debug).
- Cover prompt test: uses `case_type` + setting.
- Web: typecheck + vite build; the generate flow shows only "Start a new case"; legacy cases still
  render a sensible type label.
- Live smoke (paid, user's call): one tap → a fresh, solvable, town-set case tuned to the preset
  difficulty/age, with a coherent `case_type` + cover.

## Non-goals (deferred)

- **Scheduled / weekly auto-generation + a per-period cap + removing the manual button** — explicitly
  future. 3f only structures the generation entry point so a future scheduler can call it.
- **Per-case difficulty/age overrides in the kid UX** — difficulty/age come from presets; editing
  them stays in EditDetective (Spec 2a/2b). Debug-only overrides excepted.
- **Retrofitting legacy 24** to free-text types (they keep their enum values; display-mapped).
- **Any change to the roster model (3c) or world UI (3d).**

## Open questions

- **Theme variety / anti-repetition:** open-ended generation may converge on similar `case_type`s for
  a given detective. Recommend passing the player's **recent `case_type`s** into the prompt as
  "avoid repeating these," reusing the `previousFailureNotes`-style channel. Low cost; worth doing in
  v1.
- **Difficulty source of truth:** strictly the saved preset vs. a subtle "today I want a harder one"
  affordance. Recommend strictly preset for the one-button promise; revisit only if the user asks.
- **Auto-gen groundwork depth:** how much scheduler scaffolding to leave in 3f (none vs. a callable
  `generateForPlayer(player_id)` service seam). Recommend extracting the seam (the route already needs
  it) but **not** the scheduler.

## Acceptance criteria

1. `POST /api/mysteries/generate { player_id }` generates a case using the player's preset difficulty
   + age band; no category/difficulty required.
2. The generated case is set in a roster place, involves ≥1 roster resident (enforced), and carries a
   coherent free-text `case_type` reflected in the title + cover art.
3. The category grid + difficulty picker are gone; a single "Start a new case" button drives the
   whole flow end-to-end.
4. Solvability gate unchanged and green; legacy 24 still display correctly.
5. Server suite + web typecheck/build green; deployed to exe.dev for the iPad pass.
