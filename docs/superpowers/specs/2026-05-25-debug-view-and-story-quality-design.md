# Debug View + Story-Quality Improvements — Design

**Date:** 2026-05-25
**Status:** Approved (design); spec under review
**Branch:** `feat/debug-story-quality` (off `main` @ `f112799`, post-M3.3 merge)
**Predecessor milestones:** M2 (logic + validation), M3.1/M3.2 (narrative), M3.3 (TTS), M4 (clue tracker + solve + hints), M5a/M5b (onboarding + annotated narrative), M6 (info-leakage + multi-choice solve)

## Problem

Two linked problems surfaced during family playtests:

1. **Quality/solvability is unverifiable and sometimes wrong.** Several generated stories did not contain enough clues to deduce the answer from the prose alone, and it was not clear to the player what they were even trying to solve. There is no way to inspect what the generator intended versus what the story actually delivered.
2. **No instrument to debug it.** The full `LogicStructure` (the answer key, clue set, and deduction chain) is stored in the DB but deliberately redacted out of the gameplay API. A developer/parent cannot see the logic tree, solve path, or quality metrics to judge whether a story is fair and appropriately difficult.

This is one combined effort: a **Debug view** (the instrument) plus **generation-quality changes** (the fix), shipped together. The Debug view's clue-coverage check is the ongoing measurement for the quality changes.

## Goals

- A **Debug setting** (simple Settings toggle) that, when on, reveals for any mystery: the logic tree, solve path, full story, and quality diagnostics.
- Every essential clue needed to solve the mystery is **present in the story prose**, and the mystery is solvable (who/how/why) from the text alone.
- A clear, kid-facing **case objective** so the player knows what they are solving.
- **Difficulty-scaled misdirection**: easy = few simple red herrings; medium/hard = more, more complex misdirection.
- Mystery-writing **craft guidance** (Agatha Christie principles + Clay Stafford's 23-item checklist) summarized into the generation prompts.

## Non-goals (out of scope)

- Real authentication / PIN protection on the debug endpoint (client-side toggle only; family-prototype, anonymous-device posture).
- Graphical tree-diagram visualization (structured lists/tables only).
- Regenerating or editing a mystery from the debug view.
- Backfilling `central_question` onto pre-existing mysteries (they simply won't show one).

## Decisions locked in brainstorming (2026-05-25)

- **Scope:** one combined spec → one plan → one PR.
- **"What are we solving" is a kid-facing problem** → add an LLM-generated `central_question` shown to the player.
- **Debug gating:** simple persisted Settings toggle. Accepted spoiler caveat: a curious kid could enable it and see the answer.
- **Debug content:** logic tree, solve path, full story, **plus all four diagnostics** — clue-coverage check, validation summary, difficulty metrics, distractor options (with culprit-leak flag).
- **Case objective:** LLM-generated per story (`central_question` field), not templated.
- **Craft guidance** injected into **both** the logic-structure prompt (puzzle craft) and the narrative prompt (prose craft).

---

## Architecture

### A. Backend — debug data exposure

New endpoint: **`GET /api/mysteries/:id/debug`**.

Returns a `MysteryDebug` DTO assembled from the stored row:

- `logic_structure`: the **full, un-redacted** `LogicStructure` parsed from `logic_structure_json` — characters with `is_culprit` + `motive`, `essential_clues`, `false_clues`, `true_solution` (who/how/why), `how_distractors`, `why_distractors`, `logic_chain`, `central_question`.
- `validation`: `{ passed, attempts, notes }` from `validation_passed` / `validation_attempts` / `validation_notes`.
- `clue_coverage`: computed at request time — for each essential clue, whether its description appears in `narrative_text`, reusing the existing `textMatch` token-set-ratio helper (the same check the narrative agent's inner retry uses). Shape: `[{ id, description, present: boolean, score: number }]`.
- `metrics`: `{ difficulty, essential_count, false_count, word_count, target_words, min_words, max_words }`.
- `status`, `failure_reason` (so debug is useful even on failed mysteries).

The **public `GET /mysteries/:id` stays redacted** (unchanged except for the new non-spoiler `central_question` field — see C).

If `logic_structure_json` is absent (still generating, or a failed-before-logic row), the endpoint returns the available envelope (status, validation, metrics where derivable) with `logic_structure: null`.

**Caveat (documented, accepted):** the debug toggle is client-side `localStorage`, so this endpoint is not access-controlled — anyone who constructs the URL can call it. This matches the existing anonymous-device auth posture and is acceptable at family-prototype scale. The dedicated endpoint keeps the answer out of the normal gameplay payload, which is the meaningful protection here.

### B. Frontend — Settings + Debug panel

- **`settingsStore`** — a persisted zustand store mirroring `playerStore`, key `mysterio.settings`, holding `debugEnabled: boolean` (default `false`).
- **Settings screen** at route `/settings`, reached via a gear icon added to MainScreen. Contains the Debug on/off toggle and a one-line spoiler warning.
- **Debug panel on PlaybackScreen** — rendered only when `debugEnabled`. A collapsible `<details>`-style "🐞 Debug" section, **collapsed by default**, that fetches `/api/mysteries/:id/debug` (React Query) and renders these sub-sections:
  1. **Case & solution** — `central_question`, then `true_solution` who (resolved to character name) / how / why.
  2. **Logic tree** — characters table (name, role, **is_culprit**, motive); essential clues (labeled ESSENTIAL); false clues (labeled FALSE).
  3. **Solve path** — the ordered `logic_chain` steps.
  4. **Clue-coverage check** — per essential clue: ✓/✗ present in prose + score; a red banner if any are missing.
  5. **Validation summary** — passed?, attempts, notes, who/how/why framing.
  6. **Difficulty metrics** — counts, word count vs. target range.
  7. **Distractor options** — `how_distractors` / `why_distractors`, each flagged if it contains the culprit's name (the known M6 leak).
- Structured lists/tables only — no graph rendering.

### C. Generation — kid-facing `central_question`

- Add `central_question: string` (non-empty) to the `LogicStructure` Zod schema; the `LogicStructure` type is re-derived via `z.infer`.
- Logic-structure prompt: produce a single-sentence question, in the story's own terms, that names the WHO/HOW/WHY the kid must figure out, **without naming or revealing the culprit** (same plain-sight rule as essential clues). Example: *"Who slipped Rosie out of the locked hutch overnight, how did they get past the latched gate, and why would anyone want to?"*
- **Non-spoiler:** `central_question` is the objective, not the answer. The orchestrator stores the **full** structure (`JSON.stringify(validatedLogic)`), so `central_question` automatically reaches storage and is **exposed on the public GET DTO**. It is deliberately **not** threaded through `redact()` into the validation agent — the validator does not need it, and keeping the validator input unchanged avoids perturbing the M2.8 pass-rate.
- Add a guard (prompt rule + a lightweight check in the logic-structure agent, alongside the existing difficulty-count check) that the `central_question` does not contain the culprit's name.
- Frontend: show it on the **BriefingCard** ("Your case: …") and at the top of **PlaybackScreen**.

### D. Generation — solvability, difficulty-scaled misdirection, craft guidance

**Craft guidance module** — `apps/server/src/services/generation/prompts/craftGuidance.ts`, exporting two constants:

- `PUZZLE_CRAFT` — injected into the logic-structure system prompt. Distilled puzzle-design principles:
  - *Fair play:* the reader must be able to solve it from the clues given — never withhold a clue the detective uses, and never rely on off-page knowledge.
  - *Every clue present & decisive:* each essential clue must be plantable in the prose and must move the deduction forward; together they must be sufficient to determine who, how, and why.
  - *Clues in plain sight:* hide the decisive detail inside ordinary description, not flagged as important.
  - *The obvious suspect is a red herring:* the most suspicious-seeming character should usually not be the culprit; misdirect fairly.
  - *Multiple viable suspects:* give more than one character a plausible reason to be suspected.
  - *Grounded motive:* the culprit's why must be understandable and seeded by their description.
- `PROSE_CRAFT` — injected into the narrative system prompt. Distilled prose principles:
  - *Steady drip of clues:* distribute clues (real and red-herring) through the story rather than dumping them.
  - *Fair foreshadowing:* plant what the ending needs so the solution feels surprising yet fair on reflection.
  - *Distinct atmosphere:* let the setting's mood carry the story; make place feel like a character.
  - *Active reader engagement:* invite the listener to notice and deduce (occasional direct questions), without solving it for them.
  - *Believable dialogue & escalation:* convey information naturally; build from simple observations to the harder puzzle.

Both constants cite their sources (the Christie principles and the Stafford 23-item checklist URLs). **Transparency note in the module:** the Christie page returned HTTP 403 during authoring; that portion is distilled from well-established, widely-documented Christie advice, while the Stafford items are from the live page.

**Difficulty-scaled misdirection** — add a `misdirection` descriptor string to each level in `difficultyConfig` (`packages/shared/src/constants/difficulties.ts`):

- easy: "1–2 simple red herrings a careful kid can rule out quickly."
- medium: "3–4 moderately plausible red herrings that require comparing clues to dismiss."
- hard: "5–7 interlocking red herrings, including a deliberately misleading 'obvious suspect' who is innocent."

The logic-structure prompt references `d.misdirection` (it already interpolates `difficultyConfig`), so easy stays gentle and hard gets genuinely trickier — not just more numerous false clues, but more complex ones.

**Solvability reliability** — `PUZZLE_CRAFT` strengthens the "sufficient and decisive clues" requirement at the structure level. The narrative agent keeps its existing token-set-ratio coverage retry. The debug **clue-coverage check** is the ongoing instrument to catch prose that drops or over-obscures a clue.

---

## Data flow

```
generate → logicStructureAgent (now also emits central_question, uses PUZZLE_CRAFT + d.misdirection)
        → validation (redacted structure unchanged; central_question lives only in the full stored structure)
        → narrativeAgent (uses PROSE_CRAFT; existing clue-coverage retry)
        → ready

GET /mysteries/:id        → public DTO + central_question (no spoilers)        → BriefingCard / PlaybackScreen
GET /mysteries/:id/debug  → full LogicStructure + validation + coverage + metrics → Debug panel (only when toggle on)
```

## Testing strategy

**Unit (Vitest, no LLM):**
- `settingsStore`: default false, toggle persists.
- `central_question` schema: required + non-empty; `LogicStructure` type still infers.
- Logic-structure agent culprit-name check on `central_question` (fixture with a leaking question → rejected/flagged).
- Debug DTO assembly: given a stored row, returns full structure + correctly computed `clue_coverage` (a clue present in prose → present:true; an absent one → present:false) + metrics. Mock the row; reuse `textMatch`.
- `craftGuidance` constants are non-empty and are referenced by both prompt builders (assert the prompt output contains a sentinel phrase).

**Manual:**
- Toggle Debug on in Settings; open a live mystery; confirm the panel renders all seven sub-sections, coverage flags correctly, distractor-leak flag works.
- Confirm `central_question` shows on BriefingCard + PlaybackScreen and reads clearly without revealing the answer.
- Spot-check that hard mysteries feel meaningfully trickier than easy.

**Regression net:** the M2.8 solvability suite (nightly, gated) continues to validate corpus solvability after the prompt changes.

## Acceptance criteria

- Debug toggle in Settings; when on, PlaybackScreen shows the 🐞 Debug panel with logic tree, solve path, full story, clue-coverage, validation summary, difficulty metrics, and distractor options.
- `clue_coverage` correctly flags a missing essential clue.
- Every new mystery has a `central_question` shown to the kid that states the objective without naming the culprit.
- `difficultyConfig` carries per-level misdirection guidance and the logic-structure prompt uses it.
- Craft-guidance summaries are present in both the logic-structure and narrative prompts, with sources cited.
- Public GET never exposes the solution; the answer travels only via the debug endpoint.
- All new unit tests pass; existing suite stays green.

## Open considerations (noted, not blocking)

- The debug endpoint is unauthenticated by design; revisit if the app ever gets real users.
- If clue-coverage routinely shows misses on passing mysteries, the follow-up is to tighten the narrative coverage threshold or gate `ready` on per-clue coverage — deferred until the debug view gives us data.
