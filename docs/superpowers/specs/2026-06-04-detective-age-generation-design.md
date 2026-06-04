# Age-Range → Generation — Design Spec (Spec 2b)

_Date: 2026-06-04 · Status: approved for planning · Second of three sub-specs
decomposed from "Spec 2: Character creation + age"._

## Context

"Spec 2: Character creation + age" was decomposed into three sequential sub-specs
(see `2026-06-04-detective-accounts-design.md`). **2a** (detective accounts, shared
stories, per-detective progress, detective-agnostic prose) is shipped and merged to
`main`. It added an `age_range` band (`"8-9" | "10-11" | "12-13"`) to each detective
but did **nothing** with it at generation time — the band is captured and displayed
only.

**2b makes the band matter.** When a detective generates a mystery, their age band
tunes the generated story, and the mystery records + displays which band it was
written for.

### What the user asked for (clarified)

The band influences generation along **reader-facing** dimensions only — it tunes the
*story as experienced by the reader*, not the *story world*. Three knobs were chosen
(via brainstorming Q1, multi-select):

1. **Vocabulary + sentence complexity** — language register scales with the band
   (8-9: short, simple; 12-13: longer, richer).
2. **Solvability benchmark scales** — the hardcoded "careful eight-year-old" /
   "ages 8-13" strings in the generation prompts become the band's actual benchmark
   age, so the solvability bar matches the youngest reader in the band.
3. **Clue subtlety nudge** — the band nudges how obvious clues are, *layered on top of*
   difficulty's misdirection (8-9: more on-the-nose even on Hard; 12-13: subtler even
   on Easy).

Explicitly **NOT** chosen:

- **No story-world/peer-age skew.** The suspects, setting, and social stakes are *not*
  pushed older or younger by the band. Age is a reader-facing tuning, not a world
  tuning.
- **No stated in-story detective age.** 2a made the detective an agnostic, traits-free
  second-person **"You"** so any kid can solve any story. 2b preserves that — the band
  never states "you are twelve." (Brainstorming Q2: "Keep 'You' agnostic; age the
  world" = age the *reading level*, not the character.)
- **No structural ownership.** Difficulty keeps sole control of clue counts, false-clue
  counts, misdirection level, and word count. The age band only *nudges* subtlety
  relative to difficulty; it does not set counts or length.

### Why these boundaries

The clue-subtlety nudge (knob 3) deliberately overlaps difficulty's misdirection — a
known, accepted risk of "two knobs fighting." The mitigation is **how the nudge is
phrased**: it is a *modifier relative to* the difficulty's misdirection ("lean obvious
even on harder difficulties" / "lean subtle even on easier difficulties"), never a
competing absolute clue count. The two compose.

## Architecture

Mirror the existing **difficulty** plumbing exactly — it is the proven template for
"a parameter that tunes generation and is recorded on the mystery":

```
detective.age_range  (already exists, from 2a)
        │  server derives — client never sends it
        ▼
POST /mysteries/generate  ── stores mysteries.target_age_range
        │
        ▼
runGeneration({ …, ageRange })          orchestrator RunInput
        ├──► buildLogicStructureSystem(difficulty, ageRange)   phase 1
        ├──► buildNarrativeSystem(difficulty, ageRange)        phase 2
        └──► buildProseSolverSystem(ageRange)                  readthrough gate
        ▼
mysteries.target_age_range  ──► GET DTOs ──► "Written for ages X–Y" badge
```

**Age band is identity, not a per-mystery choice.** Unlike difficulty (which the kid
can override per generation), the age band is a fixed property of the detective. The
server derives `target_age_range` from `player.age_range`; the generate request body is
**unchanged** and any client-supplied age value would be ignored. Fallback to
`DEFAULT_AGE_RANGE` if the player row is missing.

## Components

### 1. Age-band config — `packages/shared/src/constants/ageRanges.ts`

Extend the existing file (which already exports `AGE_RANGES`, `AgeRange`,
`DEFAULT_AGE_RANGE`) with a static config array + accessor, parallel to
`DIFFICULTIES` / `difficultyConfig` in `difficulties.ts`:

```ts
export const AGE_BANDS = [
  {
    id: "8-9",
    label: "8–9",
    benchmarkAge: 8,
    vocabulary:
      "Short, simple sentences — usually one idea each. Concrete everyday words. " +
      "Avoid subordinate clauses and abstract emotion words.",
    subtletyNudge:
      "Lean toward the OBVIOUS end: the decisive clue should be plainly observable, " +
      "and red herrings stay shallow — even on harder difficulties.",
  },
  {
    id: "10-11",
    label: "10–11",
    benchmarkAge: 10,
    vocabulary:
      "Moderate sentence length with some subordinate clauses. Occasional richer " +
      "words introduced in context.",
    subtletyNudge:
      "Balanced: clues reward attention but never require expert inference.",
  },
  {
    id: "12-13",
    label: "12–13",
    benchmarkAge: 12,
    vocabulary:
      "Longer, varied sentences. Figurative language and more sophisticated emotion " +
      "are welcome.",
    subtletyNudge:
      "Lean toward SUBTLE: require the reader to COMBINE clues; avoid spelling out " +
      "connections — even on easier difficulties.",
  },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

export function ageBandConfig(id: AgeRange): AgeBand {
  const found = AGE_BANDS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown age range ${id}`);
  return found;
}
```

- `benchmarkAge` is the band's **lower** bound (conservative — the mystery must be
  solvable by the youngest kid in the band).
- `label` (`8–9` with an en-dash) is the display string for the badge.
- The `vocabulary` and `subtletyNudge` copy is a **first pass**, expected to be tuned
  during the live smoke. They are isolated in this one config file so tuning is a
  one-file edit.

### 2. Prompt edits

All edits land in the **non-cached, per-call** prompt blocks so the cached
`SAFETY_PREAMBLE` is untouched (see "Prompt caching" below).

**`prompts/logicStructure.system.ts`** — `buildLogicStructureSystem(difficulty, ageRange)`:
- Resolve `const b = ageBandConfig(ageRange)`.
- Add an `AGE BAND` line stating the band + `b.subtletyNudge`, positioned near the
  existing `MISDIRECTION FOR THIS DIFFICULTY` line so the two read together.
- Replace both "by a careful eight-year-old" (line ~57) and "A careful eight-year-old"
  (line ~79) with "by a careful `${b.benchmarkAge}`-year-old".

**`prompts/narrative.system.ts`** — `buildNarrativeSystem(difficulty, ageRange)`:
- Resolve `const b = ageBandConfig(ageRange)`.
- Replace the opening "for ages 8-13" with the band ("for ages `${ageRange}`").
- Replace the generic "Use age-appropriate vocabulary with occasional richer words"
  rule (line ~27) with `b.vocabulary`.

**`prompts/proseSolver.system.ts`** — convert the `PROSE_SOLVER_SYSTEM` const into
`buildProseSolverSystem(ageRange)`:
- Replace the hardcoded "a sharp 12-year-old detective" with
  "a sharp `${ageBandConfig(ageRange).benchmarkAge}`-year-old detective".
- Younger band → younger (stricter) solver → harder gate, which the subtlety nudge
  (more obvious clues for young bands) compensates for. The two move together.

**`prompts/shared.ts`** — `SAFETY_PREAMBLE` stays band-neutral but its one vocabulary
line is softened from "readable by an eight-year-old" to "age-appropriate for the
target band stated in the task below" so it does not contradict the 12-13 guidance.
This is a one-time edit to the cached block (still a single cache variant).

### 3. Threading

- **`routes/mysteries.ts`** (`POST /mysteries/generate`): the handler already loads the
  `player` row. Read `player?.age_range ?? DEFAULT_AGE_RANGE`, write it to the new
  `mysteries.target_age_range` column on insert, and add `ageRange` to the
  `runGeneration({...})` call.
- **`services/generation/orchestrator.ts`**: add `ageRange: AgeRange` to `RunInput`;
  pass it to `runLogicStructureAgent`, `writeAndVerifyProse`, and through to the prose
  solver.
- **`agents/logicStructureAgent.ts`, `agents/narrativeAgent.ts`** (and wherever the
  prose-solver is invoked inside the readthrough gate): pass `ageRange` into the
  respective `build…System(...)` calls.

### 4. Storage & migration

Add `target_age_range text` to the `mysteries` table in
`apps/server/src/db/schema.ts` — **nullable, no CHECK constraint**, mirroring how
`difficulty` is stored (also unconstrained text, validated at the application layer).

**Migration 0004** is generated by drizzle-kit. A plain nullable `ADD COLUMN` with no
new constraint emits a **native `ALTER TABLE mysteries ADD COLUMN`**, *not* a
table rebuild — which **sidesteps the SQLite FK-cascade gotcha** (no `DROP`/`CREATE`,
so `clues` / `solutions` / `hints` children are never disturbed). The plan must still
**verify** this: inspect the generated `0004_*.sql` to confirm it is an `ALTER`, and
run the migration against a **populated** in-memory DB asserting child rows survive
(per `reference_sqlite_fk_migration_gotcha`). If drizzle-kit unexpectedly emits a
rebuild, the migrate path must run with `foreign_keys=OFF` and the harness toggle
covered by 2a applies.

Existing mystery rows get `NULL` — their badge is simply hidden.

### 5. DTOs & web badge

- Add `target_age_range: AgeRange | null` to `MysteryDetail`
  (`apps/web/src/api/mysteries.ts`) and `MysterySummary`
  (`packages/shared/src/types/mystery.ts`), and return it from both GET handlers in
  `routes/mysteries.ts`.
- **Badge "Written for ages X–Y"** rendered via `ageBandConfig(target_age_range).label`:
  - On the shared-pool list cards in
    `apps/web/src/screens/MainScreen/RecentList.tsx`, alongside the existing
    New / In-progress / Solved chip.
  - On the mystery detail / playback screen.
  - **Hidden when `target_age_range` is `null`** (pre-2b mysteries).

## Out of scope (noted for follow-up)

- **`explanation.system.ts` and `hint.system.ts`** also hardcode "age 8-13". They are
  *post-game* reading (answer reveal, Hard-mode hints) and are left band-agnostic in
  2b. The band is already on the mystery row, so threading them later is cheap — a
  clean follow-up if playtests show younger kids struggle with hint/explanation
  reading level.
- **`services/images/style.ts`** ("age-appropriate for ages 8-13") governs cover-image
  generation and is unrelated to reading level — untouched.

## Testing

- **Unit (`packages/shared`)**: `ageBandConfig` returns each band and throws on unknown
  id (mirror `difficulties.test.ts`).
- **Unit (prompt builders)**: each of `buildLogicStructureSystem`,
  `buildNarrativeSystem`, `buildProseSolverSystem` includes the band's vocabulary /
  subtlety text and the correct `benchmarkAge` number; the "eight-year-old" / "ages
  8-13" literals are gone (string assertions, mirroring existing `*.system.test.ts`).
- **Route (`routes/mysteries.test.ts`)**: generating for a band-X detective stores
  `target_age_range = X` on the row and passes `ageRange: X` into the stubbed
  orchestrator; a client-supplied age value in the body is ignored; missing player
  falls back to `DEFAULT_AGE_RANGE`.
- **DTO**: GET `/mysteries/:id` and the list endpoint return `target_age_range`.
- **Migration**: apply 0004 to a populated in-memory DB (`apps/server/src/test/db.ts`)
  and assert `clues` / `solutions` / `hints` rows survive.
- **Web gate**: `pnpm --filter @mysterio/web typecheck` + `vite build` (no web test
  runner per `project_stack_facts_actual`). Badge verified visually in a real browser,
  not curl (per `reference_web_delete_gotchas`).
- **Live smoke (M-2b)**: generate one mystery per band; confirm reading level visibly
  differs and each is solvable by its benchmark age. This is the tuning checkpoint for
  the `vocabulary` / `subtletyNudge` copy.

## Prompt caching

`SAFETY_PREAMBLE` is sent as a `cache: true` system block on every agent call. Keeping
all band-specific text in the per-call (non-cached) blocks means the cache stays a
single variant rather than fragmenting three ways. The one edit to `SAFETY_PREAMBLE`
(softening its vocabulary line) is a single permanent change, not a per-band branch.

## Acceptance criteria

- A detective with `age_range = "8-9"` produces mysteries whose prose is visibly
  simpler than the same detective's `"12-13"` counterpart, and whose decisive clues are
  more on-the-nose — at the same difficulty.
- `mysteries.target_age_range` is populated for every newly generated mystery and
  surfaced in both GET DTOs.
- The "Written for ages X–Y" badge shows on the story list and detail for new
  mysteries, and is absent for pre-2b mysteries.
- Migration 0004 applies to a populated DB without losing clue/solution/hint rows.
- All server unit + route tests pass; web typecheck + build pass.
