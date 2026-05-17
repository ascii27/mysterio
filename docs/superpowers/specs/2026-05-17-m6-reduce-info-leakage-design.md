# M6 design — reduce info leakage + multi-choice solve

> Brainstormed 2026-05-17 in response to user playtest feedback on M5b. Three concrete fixes consolidated into one milestone because they all share the same root cause: the UI surfaces information that should be hidden from the kid until they deduce it.

## Goals

1. **Highlight false clues too.** Right now the narrative pills only mark essential clues (gold). False clues are unhighlighted — the kid can spot which mentions are essential just by their pill formatting. That's a leak. Both should be highlighted identically; figuring out which are essential is part of the deduction.

2. **Stop showing role labels (suspect / witness / bystander) on the client.** Telling the kid "Mrs. Kamble is a witness" implicitly tells her "Mrs. Kamble didn't do it." In a real mystery, you don't know who's a witness vs suspect — that's the puzzle. Server still stores roles for narrative coherence; UI collapses all non-detective characters into one undifferentiated set.

3. **Multiple-choice HOW and WHY.** Free-text inputs are friction for an 8-13yo and require LLM-based semantic grading (cost, latency, fuzzy). Multi-choice (4 options each, shuffled) is the kid-game-canonical solve UX, eliminates the grader, and lets the LogicStructure agent produce all 4 options up-front for free.

## Non-goals

- Don't rewrite the WHO picker — already multi-choice.
- Don't retire the LLM-based grader implementation yet (`runGrader`, `graderAgent.ts`, `grader.system.ts`) — those become dead code after M6, but deletion is a separate cleanup commit.
- Don't gate M6 on iPad validation of M5b — the M5b smoke is in-progress; M6 layers cleanly on top of M5b's deployed surface.

---

## Architecture

### #1 + #2 (information surface)

**Parser**: `parseAnnotations.ts` currently uses `clueIds = new Set(ls.essential_clues.map(c => c.id))`. After M6: `clueIds = new Set([...ls.essential_clues, ...ls.false_clues].map(c => c.id))`. False-clue tag drops stop happening.

**Narrative prompt**: the existing ANNOTATION RULES section says "Do NOT wrap false-clue mentions." After M6: "Wrap each false clue's first textual appearance too — same `[c:<id>]` tag form. Kids should NOT be able to tell essential from false by looking; that's the puzzle."

**Server `GET /mysteries/:id`**: the response shape's `characters` array currently includes `role`. Keep it as-is (the detective still needs to be distinguished by the client for the briefing card and for excluding from CharacterPicker). The CHANGE is on the client side — everywhere the UI renders a role badge for a non-detective character, render the same generic badge instead.

**`AnnotatedNarrative`**: `PERSON_ROLE_COLOR` + `PERSON_ROLE_BG` collapse so suspect/witness/bystander all return the same color/bg. Detective is still not annotated (parser drops it). One generic red pill for every non-detective person.

**`BriefingCard`**: "You'll meet" roster groups by detective vs non-detective. Detective row stays "🕵️ You — Detective {name}". Non-detective rows show no role label — just "{name}". The `ROLE_BADGE` map collapses for non-detective entries.

**`CharacterPicker`** (SolutionScreen): currently shows a per-role emoji + role text. After M6: every non-detective option shows the same generic suspect emoji + no role text, just the name. (`ROLE_EMOJI` map flattens for non-detective.)

### #3 (multi-choice solve)

**LogicStructure schema** gains two new fields:

```ts
true_solution: {
  who_did_it: string,
  how: string,
  why: string,
}
// new top-level fields:
how_distractors: [string, string, string],   // exactly 3 wrong how options
why_distractors: [string, string, string],   // exactly 3 wrong why options
```

**Zod superRefine** invariants:
- `how_distractors` is exactly 3 strings, each distinct from `true_solution.how` and from each other.
- `why_distractors` is exactly 3 strings, each distinct from `true_solution.why` and from each other.
- Each distractor is non-empty, ≤ 200 chars.

**LogicStructure agent prompt** addition (new section after `CLUE OBFUSCATION`):

```
DISTRACTOR OPTIONS for multiple-choice solve:
- Generate exactly 3 distinct distractors for how_distractors[] and 3 for why_distractors[].
- Each distractor must be a PLAUSIBLE-sounding but WRONG explanation. A careful 10-year-old reading the clues should be able to rule them out, but a kid skimming should find them tempting.
- Distractors should match the style/length of the true how/why (one sentence each).
- Do NOT make distractors that are obviously wrong (e.g., "the rabbit teleported"). Subtle plausibility = better puzzle.
- Examples for a missing-pet mystery where the true how is "Theo unlatched the hutch and lured Rosie with clover":
    GOOD how_distractors:
      - "A fox dug under the hutch and pulled Rosie out through the back."
      - "The latch was old and finally broke open on its own overnight."
      - "Priya climbed the fence to play with Rosie and left the door open."
    BAD distractor: "Rosie unlocked the latch herself and walked away." (too implausible)
```

**Server-side simplification:**
- `runGrader` calls in `submit-solution` retire. Replace with `===` string comparison against `ls.true_solution.how` / `ls.true_solution.why`.
- `graderAgent.ts`, `grader.system.ts`, `runGrader` exports stay in the codebase (dead code) for the M6 release; a follow-up commit can delete them once the live test confirms multi-choice works.

**New `GET /api/mysteries/:id/solve-options` endpoint:**

Returns the data the SolutionScreen needs to render the form:
```jsonc
{
  "characters": [{id, name, /* no role */}, ...],   // non-detective only, role hidden
  "how_options": [string, string, string, string],  // shuffled (true + 3 distractors)
  "why_options": [string, string, string, string],  // shuffled (true + 3 distractors)
}
```

Note: the WHO options are shuffled by the kid's mental model (they pick a name from the picker). The HOW and WHY options come pre-shuffled from the server so the truth isn't always in position 0. Server shuffles using a per-request `Math.random()` (acceptable for kid app — no need for crypto).

Server guards:
- 409 if mystery not ready (same as solution endpoints).
- 409 if a solution row already exists (no need to peek at options after solve).

**`POST /api/mysteries/:id/submit-solution` becomes synchronous + cheap:**
- Body unchanged: `{guess_who, guess_how, guess_why}` (the picked text from the option list).
- Server compares: `who_match = guess_who === true_solution.who_did_it` (already); `how_match = guess_how === true_solution.how` (new — was grader call); `why_match = guess_why === true_solution.why` (new — was grader call).
- No more `Promise.all([runGrader(how), runGrader(why)])` → save ~5s + ~$0.005 per submit.
- Explanation agent still runs (kid still wants the 100-150 word recap).

**Frontend `GuessForm`:**
- Replace HOW textarea with `<HowPicker options={how_options} value={how} onChange={setHow} />` — same shape as CharacterPicker (button row).
- Replace WHY textarea with `<WhyPicker options={why_options} value={why} onChange={setWhy} />`.
- New API client: `getSolveOptions(mysteryId)` (web).
- `SolutionScreen` fetches solve-options when the kid opens the page; passes options through to GuessForm.

---

## Acceptance criteria

**M6 ships when:**

1. A fresh LLM generation produces `how_distractors` + `why_distractors` arrays of length 3 each (verified via DB inspection).
2. The Zod schema rejects any LogicStructure missing distractors (verified via unit test).
3. False clues now appear as gold pills in the prose alongside essential clues (verified via Playwright snapshot of a fresh narrative).
4. The BriefingCard "You'll meet" roster shows no role labels for non-detective characters (verified via Playwright snapshot).
5. AnnotatedNarrative pill color is uniform red for all non-detective people (verified visually).
6. CharacterPicker on SolutionScreen shows no role text (verified visually).
7. GuessForm renders HOW + WHY as 4-button option rows (not textareas).
8. Submitting the correct HOW + WHY + WHO yields `is_correct: 1` (verified via Playwright tap-through).
9. The submit-solution route no longer calls `runGrader` (verified via grep + server-log absence of grader entries on submit).
10. Deployed to panther-golem.exe.xyz; iPad handoff to user with a 9-step walkthrough.

---

## Out of scope (deferred)

- **Deleting the graderAgent / grader.system / runGrader** — dead after M6, but the deletion is a clean follow-up commit, not blocking M6.
- **Replacing the WHO picker with a no-role version** — only the badge/label change; the CharacterPicker structure stays.
- **Per-mystery option count tuning** — fixed at 4 options (1 true + 3 distractors) across all difficulties. Hard mode could go to 5 in a future tuning pass.
- **Shuffling persistence** — each visit to /solve gets a fresh shuffle. Acceptable; the kid can't memorize "option 2 is always correct" because option 2 is different per visit.
- **Re-categorizing existing clue rows** — pre-M6 manual clues already in the DB stay as they are.

---

## Spec self-review

- **Placeholders:** none.
- **Internal consistency:** the schema additions, server endpoint, and frontend component changes form a coherent flow. The kid sees options → picks → submits → server does string compare → reveals.
- **Scope:** comfortably one implementation plan. ~10 tasks.
- **Ambiguity:** "person of interest" vs "suspect" wording for non-detective characters — picked "Suspect" emoji (🤔) without role text. Anyone in the briefing-card roster is implicitly a potential suspect.

Approved by user (architecture + multi-choice option source) 2026-05-17. Ready to translate into an implementation plan.
