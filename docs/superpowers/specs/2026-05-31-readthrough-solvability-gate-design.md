# Readthrough Solvability Gate + On-Demand Audio — Design

**Date:** 2026-05-31
**Branch (proposed):** `feat/readthrough-gate`
**Origin:** Playtest feedback from the 10-year-old tester on PR #3's build (`feat/debug-story-quality`, deployed but unmerged).

## Motivation

The tester solved the mystery and liked it, but surfaced one load-bearing defect and several smaller notes:

- **"What latch"** — the solution reveal referenced a *latch* on the gate that the **narrative prose never set up**. The mystery was internally valid (who/how/why *was* derivable from the abstract `LogicStructure`), but the realized story, read top-to-bottom, referenced something that was never introduced. Her own suggestion: *"set up a separate test that goes from top to bottom and confirms that it is possible to understand the mystery in the order it is presented, and figure it out."*
- **"Didn't need read to me"** — audio (TTS) was not used; it costs ~4.2 MB + generation time on every mystery.
- **Hint/clue section is center-aligned** — should be left-aligned.

This design addresses three workstreams. Two further notes ("lily" annotation formatting, and whether clues should be visually highlighted at all) are explicitly **out of scope** for this round (see §6).

### The root-cause gap

Today the pipeline validates **solvability against the `LogicStructure` JSON, before any prose exists** (`orchestrator.ts:133` → `runValidationAgent(redact(logic))`). The narrative is then written *once*, after the outer logic-regen loop succeeds, and the only check the prose itself receives is a **fuzzy token-set match** (`findMissingClues`, threshold 0.75) confirming each essential clue's *description* text appears *somewhere* in the prose — in any order, with no comprehension or continuity check.

So nothing today verifies that the **story as a kid actually reads it** is (a) solvable from the prose alone and (b) free of dangling references to things the reveal depends on. That is the gap "What latch" fell through.

---

## Workstream A — Readthrough solvability gate (the core)

A new generation-time gate that runs **after the prose is written** and evaluates the realized narrative the way a reader experiences it: briefing (`central_question`) → story → guess → solution reveal.

It performs **two checks**, each a separate Claude call:

### A1. Prose-solver (the "can a kid figure it out" check)

A fresh solver that must deduce who/how/why **from the story itself**, not from the abstract clue list.

- **Input:**
  - `central_question` (the kid sees this on the briefing),
  - the **narrative prose** (clean text, `[p:…]`/`[c:…]` tags stripped — the same text the kid reads),
  - a **redacted cast roster**: `{ id, name, role, description }` per character — identical to the existing `redact()` projection (no `is_culprit`, no `motive`). The roster mirrors the suspect list the kid has in the clue tracker and lets the solver return a character **id**.
- **Forbidden inputs:** `essential_clues`, `false_clues`, `logic_chain`, `true_solution`. The solver must extract everything from the prose.
- **Output schema:** reuse `validationGuessSchema` — `{ guess: { who, how, why }, reasoning, confidence }`, with `who` validated against the roster's ids (same id-gate as `runValidationAgent`).
- **Pass/fail:** run the guess through the existing **`compareSolutions(guess, true_solution)`** — exact id match on `who`, semantic grade on `how`/`why`, `confidence < 0.5` floor. Identical gate to today's structure-validation, so behavior and tuning are consistent.

This is deliberately a *variant* of the existing `validationAgent`: same output, same comparator, but fed the **prose** instead of the **redacted structure**. It proves the writing actually carries the clues, not just that the structure theoretically could.

### A2. Continuity auditor (the "What latch" check)

A separate call that verifies every concrete element the reveal depends on is established in the prose.

- **Input:** the narrative prose + `central_question` + **`true_solution`** (it *needs* the answer to know what the reveal references — which is exactly why it must be a separate call from the solver, who must *not* see the answer).
- **Task:** identify concrete, load-bearing elements named in the `central_question` and `true_solution` (`how`/`why`) — e.g. "the latch", "the muddy boots", "the side gate" — and report any that are **never established in the prose**.
- **Output schema (new):**
  ```ts
  {
    dangling: Array<{ element: string; where: "central_question" | "solution"; note: string }>,
    ok: boolean   // true iff dangling is empty
  }
  ```
- **Pass/fail:** fail iff `dangling` is non-empty. The dangling elements become the feedback note for regeneration ("the solution hinges on *the latch*, but the latch is never mentioned in the story — introduce it earlier").

**Scope of the auditor:** only elements traceable to the `central_question` and `true_solution`. It is *not* a general prose-continuity linter — that would be too strict (prose is full of incidental nouns). Keeping it scoped to the reveal makes it tractable and directly targets the reported bug.

### A3. Orchestrator restructuring

To support "regenerate prose, then escalate to logic-regen," the narrative + readthrough gate must move **inside** the outer logic-regen loop, making it a single "craft a fair mystery" loop. This is the main structural change.

New `runGeneration` shape (pseudocode):

```
OUTER loop  (logic attempts, 1..MAX_VALIDATION_ATTEMPTS, with previousFailureNotes):
  1. logic = runLogicStructureAgent(previousFailureNotes)
  2. structure-validation: runValidationAgent(redact(logic)) → compareSolutions
       fail → previousFailureNotes = notes; continue OUTER
  3. INNER narrative loop  (1..MAX_NARRATIVE_ATTEMPTS, with narrativeNotes):
       a. narrativeRes = runNarrativeAgent(logic, narrativeNotes)
            (existing agent already does the cheap clue-coverage fuzzy retry internally;
             see "retry budget" note below)
       b. READTHROUGH GATE on narrativeRes.value.narrative_text:
            - A1 prose-solver  → compareSolutions  → solvable?
            - A2 continuity auditor → dangling refs?
          pass  → persist narrative, transition to `ready`. DONE ✅
          fail  → narrativeNotes = combined(A1 miss, A2 dangling); next INNER attempt
  4. INNER exhausted → escalate:
       previousFailureNotes = "prose could not be made solvable after N attempts: <notes>"
       continue OUTER
OUTER exhausted → status `failed`, failure_reason `readthrough_exhausted`,
                  validation_passed = 0  ("couldn't craft a fair mystery" UX)
```

**Retry budget.** Today `runNarrativeAgent` owns an internal loop (`maxAttempts`) for the cheap fuzzy clue-coverage check. The readthrough gate sits *outside* a single narrative draft. Cleanest split:

- `runNarrativeAgent` keeps its internal fuzzy-coverage retry (unchanged) and returns one accepted draft.
- The orchestrator wraps it in a **readthrough-retry loop** (new constant `MAX_READTHROUGH_ATTEMPTS`, default **2**). Each iteration calls `runNarrativeAgent` afresh with the accumulated readthrough notes, then runs the gate.
- On readthrough exhaustion, escalate to the OUTER logic loop as above.

This keeps each function's responsibility crisp: narrative agent = "write prose that contains the clue text"; readthrough loop = "make the prose solvable and continuous"; outer loop = "if prose can't be fixed, the structure may be weak — regenerate it."

### A4. Feedback note format

The note fed back into narrative regeneration must be specific and actionable (consistent with the existing `previousFailureNotes` philosophy). Combine both checks:

- From A1 (solvability): which of who/how/why the prose-solver got wrong, and its stated reasoning, so the rewrite knows *which clue didn't land*.
- From A2 (continuity): the exact dangling elements ("the latch") and where they surface.

Escalation note (to the logic agent) flags that prose rewriting failed and names the persistent problem, so the next structure attempt can strengthen or simplify the relevant clue/mechanism.

### A5. Persistence

Per the project convention "persist on every attempt":

- Reuse `validation_notes` to store the readthrough outcome notes (latest attempt), so the §8 solvability corpus captures prose-level failures too.
- New `failure_reason` value `readthrough_exhausted` for the terminal case.
- No new schema column is strictly required for MVP; if useful for the Debug view later, a `readthrough_passed` boolean can be added, but that is **out of scope** here.

### A6. Cost & model notes

The gate adds, per readthrough attempt: 1 prose-solver call + 1 continuity-auditor call + 1 `compareSolutions` (itself a semantic grade). Worst case across the full loop: `MAX_VALIDATION_ATTEMPTS × (1 structure-validate + MAX_READTHROUGH_ATTEMPTS × (1 narrative + ~3 grade calls))`. Bad cases are rare and capped. Default both new agents to **Sonnet**, matching the existing graders (`validationAgent`, `compareSolutions`), with `temperature ≈ 0.3` for the solver and `0.0–0.2` for the auditor. Revisit model tier if T13-style smoke shows cost pressure.

---

## Workstream B — On-demand audio + Settings toggle

Audio becomes **opt-in and on-demand**. The generation pipeline no longer produces audio; a user generates it explicitly when they want it.

### B1. Settings

- New persisted flag **`settingsStore.audioEnabled`**, mirroring the existing `debugEnabled` pattern (distinct localStorage key, e.g. `mysterio.settings`). **Default: off** (matches "didn't need read to me").
- New toggle row on the Settings screen: "🔊 Audio narration" with a one-line explanation that it generates a spoken version on demand.

### B2. Orchestrator

- **Remove the TTS phase** from `runGeneration`. After the readthrough gate passes and the narrative is persisted, the mystery transitions **straight to `ready`** (drop the intermediate `synthesizing` status from the happy path). `audio_path` stays NULL by default.
- `runTtsAgent` and the `TTSProvider` adapter are **retained** — they move from the pipeline to an on-demand endpoint. No adapter changes.

### B3. New endpoint — `POST /api/mysteries/:id/audio`

- Runs `runTtsAgent({ mysteryId, narrativeText })` for the stored `narrative_text`, writes `audio_path`, and returns the freshly minted signed `audio_url` (same minting the GET route already does).
- **Idempotent:** if `audio_path` already exists, return the existing signed URL without re-synthesizing.
- Auth: same device-id bearer posture as other routes.
- Errors: on TTS failure, return a 5xx with a clear message; the client surfaces a "couldn't generate audio, try again" state. The mystery is unaffected (text remains readable).

### B4. PlaybackScreen audio UI (gated on `audioEnabled`)

Replace the current unconditional `{data.audio_url && <audio …/>}` block with state-driven rendering:

| `audioEnabled` | `audio_url` present | Render |
|---|---|---|
| off | (either) | **nothing** audio-related |
| on | yes | the `<audio>` player (today's behavior) |
| on | no | a **"🔊 Generate audio"** button → calls `POST …/audio`, shows a pending state ("Generating…"), then refetches the mystery and reveals the player |

Existing mysteries that already carry audio keep working — shown only when the toggle is on.

---

## Workstream C — Clue/hint section alignment fix

The solve-flow clue/hint section renders center-aligned; it should be left-aligned.

- Investigation: none of `ClueSummary`, `HintControls`, or `ClueTracker` set `textAlign` themselves, so the centering is **inherited from a parent wrapper**. The exact offending container must be confirmed against the **live render** (iPad/desktop) during implementation — likely an inherited `textAlign: "center"` higher in the tree.
- Fix: set the clue/hint text containers to `textAlign: "left"` explicitly (one-line CSS). Verify on the running app that `ClueSummary` and `HintControls` read left-aligned and nothing else regresses.

---

## §5 Testing

- **A1/A2 agents:** unit-test the *pure* parsing/decision helpers with canned Claude output (the established pattern — mock `claudeText`, assert schema-parse + pass/fail logic). Specifically: solver id-gate rejects unknown ids; auditor flags a known dangling element and passes clean prose.
- **Orchestrator loop:** test the restructured control flow with **stubbed agents** (canned data) — the project's "stub before real" convention. Assert: readthrough pass → `ready`; readthrough fail then prose-regen pass → `ready`; readthrough exhaustion → outer escalation → eventual `failed`/`readthrough_exhausted`. No live LLM in unit tests.
- **On-demand audio:** route test for `POST …/audio` — generates when absent, idempotent when present, signed-URL shape. Stub the TTS provider.
- **Web:** gated on typecheck + build (no test runner in `apps/web`, deliberately not added). Manual: audio toggle matrix (off/on×present/absent), alignment fix.
- **Live smoke (T-final, user-gated):** generate a fresh mystery; confirm the readthrough gate runs and a "What latch"-style dangling reference is caught + repaired across a regen; confirm no audio is auto-generated; click "Generate audio" and confirm playback.

## §6 Out of scope (this round)

- **"lily" annotation formatting** weirdness — separate presentation bug.
- **Whether to highlight clues in prose at all** (the deeper "highlighting tells the kid which words matter / false-clue pill is a spoiler" question) — a real design topic, but its own brainstorm. This round does **not** change `AnnotatedNarrative` highlighting.
- **Pictures / illustrations** — future feature.
- **Offline replay/diagnostic harness** for readthrough — we chose a live gate; an offline suite reusing the same solver can come later.

## §7 Open questions

- `MAX_READTHROUGH_ATTEMPTS` default (proposed **2**) and whether structure-validation should be relaxed once the readthrough gate exists (the readthrough is a strictly stronger solvability signal — but removing structure-validation loses the cheap early-exit before expensive prose). **Recommendation: keep both** for now; revisit if cost is a problem.
- Whether to expose a `readthrough_passed` field on the Debug view later (deferred).
