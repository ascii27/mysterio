# Debug View + Story-Quality Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a debug-gated inspection view (logic tree, solve path, full story, quality diagnostics), an LLM-generated kid-facing case objective, difficulty-scaled misdirection, and mystery-writing craft guidance injected into the generation prompts.

**Architecture:** A new pure `buildDebugView` helper feeds a dedicated `GET /mysteries/:id/debug` endpoint that returns the un-redacted `LogicStructure` + validation fields + computed clue-coverage + metrics; the public GET gains only the non-spoiler `central_question`. The web app gets a persisted `settingsStore`, a Settings screen with a Debug toggle, and a collapsible Debug panel on PlaybackScreen. Generation prompts gain a `central_question` field, per-difficulty `misdirection` guidance, and distilled craft summaries.

**Tech Stack:** TypeScript, Zod, Vitest (server + shared), React + zustand + React Query (web), Fastify, Drizzle (better-sqlite3).

**Reference:** `docs/superpowers/specs/2026-05-25-debug-view-and-story-quality-design.md`

**Branch:** `feat/debug-story-quality` (off `main` @ `f112799`; design committed at `2eb866e`).

**Conventions (apply silently):** relative imports use `.js` extensions (NodeNext); end every commit message with a blank line then `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Run shared tests with `pnpm --filter @mysterio/shared test <path>`, server with `pnpm --filter @mysterio/server test <path>`, typecheck with `pnpm --filter <pkg> typecheck`, web build with `pnpm --filter @mysterio/web build`.

---

### Task 1: Add `central_question` to the LogicStructure schema + culprit-name guard

**Files:**
- Modify: `packages/shared/src/schemas/logicStructure.ts`
- Test: `packages/shared/src/schemas/logicStructure.test.ts`

`central_question` is the kid-facing objective ("Who took Rosie, how, and why?"). It must never name the culprit (same fair-play rule as essential clues). The `LogicStructure` type is `z.infer`-derived, so it updates automatically.

- [ ] **Step 1: Read the existing test file to match its fixture/import style**

Run: `sed -n '1,40p' packages/shared/src/schemas/logicStructure.test.ts`
Note how a valid `LogicStructure` fixture is built (there are existing passing tests from M2.1/M5a/M6 — reuse the fixture builder/object they use).

- [ ] **Step 2: Add the failing tests**

Append to `packages/shared/src/schemas/logicStructure.test.ts` (adapt `makeValid()` / the existing fixture helper name to whatever the file already uses; the key point is "a valid structure plus `central_question`"):

```ts
describe("central_question", () => {
  it("accepts a valid central_question that does not name the culprit", () => {
    const ls = makeValid(); // existing helper that returns a valid LogicStructure object (without central_question)
    const res = logicStructureSchema.safeParse({
      ...ls,
      central_question: "Who slipped the rabbit out of the locked hutch overnight, and how did they get past the gate?",
    });
    expect(res.success).toBe(true);
  });

  it("rejects a missing central_question", () => {
    const ls = makeValid();
    const res = logicStructureSchema.safeParse(ls); // no central_question
    expect(res.success).toBe(false);
  });

  it("rejects a central_question that names the culprit", () => {
    const ls = makeValid();
    const culprit = ls.characters.find((c: { is_culprit: boolean }) => c.is_culprit)!;
    const res = logicStructureSchema.safeParse({
      ...ls,
      central_question: `Did ${culprit.name} take the rabbit, and how?`,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /central_question/.test(i.message))).toBe(true);
    }
  });
});
```

> If `makeValid()` does not exist, build the fixture inline by copying the valid object from an existing passing test in this file and adding the field under test. Do NOT invent new character/clue shapes — reuse what the file already validates as good.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @mysterio/shared test src/schemas/logicStructure.test.ts`
Expected: the three new tests FAIL (`central_question` not yet in schema → the "accepts" test fails because the field is stripped/unknown is allowed but the "rejects missing" test fails because the field isn't required, and the culprit-name test fails because no guard exists).

- [ ] **Step 4: Add the field + guard to the schema**

In `packages/shared/src/schemas/logicStructure.ts`, add `central_question` to the object (after `logic_chain`, before the `.superRefine`):

```ts
  logic_chain: z.array(z.string().min(10).max(400)).min(3).max(8),
  central_question: z.string().min(10).max(300),
}).superRefine((val, ctx) => {
```

Then inside the existing `.superRefine` body, after the detective checks and before the clue-id-dedup loop, add:

```ts
  // central_question must not name the culprit (fair play — same rule as essential clues)
  const culprit = val.characters.find((c) => c.is_culprit);
  if (culprit && val.central_question.toLowerCase().includes(culprit.name.toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "central_question must not name the culprit",
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mysterio/shared test src/schemas/logicStructure.test.ts`
Expected: PASS (all prior tests + 3 new). If a prior test built a "valid" structure without `central_question`, it will now fail — fix it by adding a `central_question` to that fixture (it was valid before; it just needs the new required field). This is expected and correct.

- [ ] **Step 6: Typecheck shared**

Run: `pnpm --filter @mysterio/shared typecheck`
Expected: clean. (`LogicStructure` now includes `central_question` via `z.infer`.)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/logicStructure.ts packages/shared/src/schemas/logicStructure.test.ts
git commit -m "feat: add central_question to LogicStructure schema + culprit-name guard"
```

---

### Task 2: Add per-difficulty `misdirection` descriptors

**Files:**
- Modify: `packages/shared/src/constants/difficulties.ts`
- Test: `packages/shared/src/constants/difficulties.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append `packages/shared/src/constants/difficulties.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIFFICULTY_IDS, difficultyConfig } from "./difficulties.js";

describe("difficulty misdirection", () => {
  it("every difficulty has a non-empty misdirection descriptor", () => {
    for (const id of DIFFICULTY_IDS) {
      const d = difficultyConfig(id);
      expect(typeof d.misdirection).toBe("string");
      expect(d.misdirection.length).toBeGreaterThan(10);
    }
  });

  it("scales: hard mentions an obvious suspect, easy does not", () => {
    expect(difficultyConfig("hard").misdirection.toLowerCase()).toContain("obvious suspect");
    expect(difficultyConfig("easy").misdirection.toLowerCase()).not.toContain("obvious suspect");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/shared test src/constants/difficulties.test.ts`
Expected: FAIL — `misdirection` is `undefined`.

- [ ] **Step 3: Add the descriptors**

In `packages/shared/src/constants/difficulties.ts`, add a `misdirection` field to each entry:

```ts
  {
    id: "easy",
    name: "Easy",
    essentialClues: 3,
    falseCluesMin: 1,
    falseCluesMax: 2,
    targetWords: 600,
    wordToleranceFraction: 0.15,
    misdirection: "1-2 simple red herrings that a careful kid can rule out quickly on their own.",
  },
  {
    id: "medium",
    name: "Medium",
    essentialClues: 4,
    falseCluesMin: 3,
    falseCluesMax: 4,
    targetWords: 900,
    wordToleranceFraction: 0.15,
    misdirection: "3-4 moderately plausible red herrings that require comparing two or more clues to dismiss.",
  },
  {
    id: "hard",
    name: "Hard",
    essentialClues: 5,
    falseCluesMin: 5,
    falseCluesMax: 7,
    targetWords: 1200,
    wordToleranceFraction: 0.15,
    misdirection: "5-7 interlocking red herrings, including a deliberately misleading obvious suspect who turns out to be innocent.",
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/shared test src/constants/difficulties.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck shared**

Run: `pnpm --filter @mysterio/shared typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/difficulties.ts packages/shared/src/constants/difficulties.test.ts
git commit -m "feat: add per-difficulty misdirection descriptors"
```

---

### Task 3: Craft-guidance module (Christie + Stafford summaries)

**Files:**
- Create: `apps/server/src/services/generation/prompts/craftGuidance.ts`
- Test: `apps/server/src/services/generation/prompts/craftGuidance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/prompts/craftGuidance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PUZZLE_CRAFT, PROSE_CRAFT } from "./craftGuidance.js";

describe("craft guidance", () => {
  it("PUZZLE_CRAFT covers fair play and clue sufficiency", () => {
    expect(PUZZLE_CRAFT.length).toBeGreaterThan(100);
    expect(PUZZLE_CRAFT.toLowerCase()).toContain("fair play");
    expect(PUZZLE_CRAFT.toLowerCase()).toContain("obvious suspect");
  });

  it("PROSE_CRAFT covers drip of clues and reader engagement", () => {
    expect(PROSE_CRAFT.length).toBeGreaterThan(100);
    expect(PROSE_CRAFT.toLowerCase()).toContain("clue");
    expect(PROSE_CRAFT.toLowerCase()).toContain("foreshadow");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/craftGuidance.test.ts`
Expected: FAIL — `Cannot find module './craftGuidance.js'`.

- [ ] **Step 3: Create the module**

Create `apps/server/src/services/generation/prompts/craftGuidance.ts`:

```ts
// Mystery-writing craft guidance distilled for the generation prompts.
// Sources:
//   - Agatha Christie's mystery-writing principles (careerauthors.com/christie-tips-on-mystery-writing/)
//     NOTE: that page was HTTP-403 at authoring time; this is distilled from well-established,
//     widely-documented Christie advice, not copied from the live page.
//   - Clay Stafford, "23 Checklist Items to Write a Great Mystery"
//     (claystafford.com/2024/06/20/23-checklist-items-to-write-a-great-mystery/)

/** Injected into the logic-structure (puzzle-design) prompt. */
export const PUZZLE_CRAFT = `MYSTERY CRAFT — PUZZLE DESIGN (Christie + Stafford):
- Fair play above all: the reader must be able to solve it from the clues you provide. Never withhold a clue the solution depends on, and never require off-page knowledge.
- Every essential clue must be present and decisive: each one moves the deduction forward, and together they are SUFFICIENT to determine who, how, and why. If a careful kid could not reach the answer from the essential clues alone, the puzzle is broken.
- Hide clues in plain sight: plant the decisive detail inside ordinary description, not flagged as important.
- The obvious suspect is usually a red herring: let the most suspicious-seeming character be innocent, and misdirect fairly.
- Give multiple viable suspects: more than one character should have a plausible reason to be suspected.
- Ground the motive: the culprit's "why" must be understandable and seeded by their own description.`;

/** Injected into the narrative (prose) prompt. */
export const PROSE_CRAFT = `MYSTERY CRAFT — PROSE (Christie + Stafford):
- Steady drip of clues: distribute the clues (real and red-herring) across the story rather than dumping them in one place.
- Foreshadow fairly: plant what the ending needs so the answer feels surprising yet fair once the listener looks back.
- Distinct atmosphere: let the setting's mood do work; make the place feel almost like a character.
- Active reader engagement: invite the listener to notice and deduce (an occasional direct question), but never solve it for them.
- Believable dialogue and a build: convey information through natural talk and observation; escalate from simple noticing to the harder puzzle.`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/craftGuidance.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/prompts/craftGuidance.ts apps/server/src/services/generation/prompts/craftGuidance.test.ts
git commit -m "feat: craft-guidance summaries (Christie + Stafford) for prompts"
```

---

### Task 4: Logic-structure prompt — central_question, misdirection, PUZZLE_CRAFT

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`
- Test: `apps/server/src/services/generation/prompts/logicStructure.system.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLogicStructureSystem } from "./logicStructure.system.js";

describe("buildLogicStructureSystem", () => {
  it("includes the central_question schema field and rule", () => {
    const s = buildLogicStructureSystem("easy");
    expect(s).toContain("central_question");
  });

  it("interpolates the difficulty misdirection guidance", () => {
    expect(buildLogicStructureSystem("hard").toLowerCase()).toContain("obvious suspect");
    expect(buildLogicStructureSystem("easy").toLowerCase()).toContain("simple red herrings");
  });

  it("includes the PUZZLE_CRAFT guidance", () => {
    expect(buildLogicStructureSystem("medium")).toContain("MYSTERY CRAFT — PUZZLE DESIGN");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/logicStructure.system.test.ts`
Expected: FAIL — strings not present yet.

- [ ] **Step 3: Edit the prompt builder**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`:

(a) Add ONLY the craft-guidance import (the file already imports `{ difficultyConfig, type DifficultyId }` — do not duplicate it):
```ts
import { PUZZLE_CRAFT } from "./craftGuidance.js";
```

(b) In the SCHEMA JSON block, add `central_question` right after the `logic_chain` array (before the closing `}` of the schema object):
```ts
  "logic_chain": [
    "<each entry combines clues already introduced to deduce part of the true_solution; ordered>",
    ... (3-8 entries)
  ],
  "central_question": "<ONE sentence, in the story's own terms, stating what the kid must figure out — the WHO, HOW, and WHY — WITHOUT naming or revealing the culprit. Example: 'Who slipped Rosie out of the locked hutch overnight, how did they get past the latched gate, and why would anyone want to?'>"
}
```

(c) Add a DESIGN RULE bullet (in the DESIGN RULES section):
```
- CENTRAL QUESTION: write central_question as a single, vivid sentence that tells the kid exactly what they are solving (who did it, how, and why), phrased in the story's own terms. It MUST NOT name the culprit or give away the answer — it states the question, not the solution.
```

(d) Replace the false-clue count line in the DIFFICULTY line / false-clue guidance to reference misdirection. Find the `DIFFICULTY:` line and append a misdirection sentence right after it:
```ts
  return `You are a mystery designer for a kids' game.

Your output is a single JSON object that conforms exactly to the schema described below. Output ONLY the JSON — no prose, no markdown fences, no commentary.

DIFFICULTY: ${d.name} — produce exactly ${d.essentialClues} essential clues and ${d.falseCluesMin}-${d.falseCluesMax} false clues.
MISDIRECTION FOR THIS DIFFICULTY: ${d.misdirection} The false_clues you write should match this level of misdirection.
```

(e) At the very end of the returned template string (after the DISTRACTOR OPTIONS section, before the closing backtick), append the craft guidance:
```ts
    BAD: "Rosie unlocked the latch herself and walked away." (too implausible)

${PUZZLE_CRAFT}`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/logicStructure.system.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck server**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts apps/server/src/services/generation/prompts/logicStructure.system.test.ts
git commit -m "feat: logic prompt emits central_question + difficulty misdirection + PUZZLE_CRAFT"
```

---

### Task 5: Narrative prompt + agent — PROSE_CRAFT, central-question hook, pass central_question through

**Files:**
- Modify: `apps/server/src/services/generation/prompts/narrative.system.ts`
- Modify: `apps/server/src/services/generation/agents/narrativeAgent.ts`
- Test: `apps/server/src/services/generation/prompts/narrative.system.test.ts` (create)
- Test: `apps/server/src/services/generation/agents/narrativeAgent.test.ts` (modify if it exists; otherwise add a focused redactForNarrative test in a new file — see Step 3)

- [ ] **Step 1: Write the failing prompt test**

Create `apps/server/src/services/generation/prompts/narrative.system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNarrativeSystem } from "./narrative.system.js";

describe("buildNarrativeSystem", () => {
  it("includes the PROSE_CRAFT guidance", () => {
    expect(buildNarrativeSystem("easy")).toContain("MYSTERY CRAFT — PROSE");
  });

  it("instructs the writer to establish the central question early", () => {
    expect(buildNarrativeSystem("easy").toLowerCase()).toContain("central question");
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/narrative.system.test.ts`
Expected: FAIL.

- [ ] **Step 3: Edit the narrative prompt**

In `apps/server/src/services/generation/prompts/narrative.system.ts`:

(a) Add ONLY the craft-guidance import (the file already imports `{ difficultyConfig, type DifficultyId }` — do not duplicate it):
```ts
import { PROSE_CRAFT } from "./craftGuidance.js";
```

(b) Add a CRITICAL RULE bullet about the central question (in the CRITICAL RULES list):
```
- MAKE THE CENTRAL QUESTION CLEAR EARLY: in the opening, establish vividly what is wrong and what the listener is trying to figure out (the who/how/why), so a kid is never confused about the goal. Do NOT answer it — just pose it.
```

(c) At the very end of the returned template (after the last paragraph about MISSING CLUES, before the closing backtick), append:
```ts
If you receive a list of MISSING CLUES from a previous attempt, weave each missing clue into the prose naturally — keep the rest of the story largely intact.

${PROSE_CRAFT}`;
```

- [ ] **Step 4: Pass central_question to the narrative agent input**

In `apps/server/src/services/generation/agents/narrativeAgent.ts`, update `redactForNarrative` to include `central_question` (so the writer can open on it):

```ts
function redactForNarrative(ls: LogicStructure) {
  return {
    category: ls.category,
    setting: ls.setting,
    central_question: ls.central_question,
    characters: ls.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      description: c.description,
    })),
    essential_clues: ls.essential_clues,
    false_clues: ls.false_clues,
    // omit true_solution and logic_chain — narrative shouldn't peek at the answer
  };
}
```

- [ ] **Step 5: Add a focused agent test for the redaction**

The existing `narrativeAgent.test.ts` (if present) mocks `claudeText`. Add one assertion-only test that does not need the LLM, in a new file `apps/server/src/services/generation/agents/narrativeAgent.redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNarrativeSystem } from "../prompts/narrative.system.js";

// redactForNarrative is module-private; assert the observable contract instead:
// the prompt tells the writer to use central_question, and the agent input type includes it.
describe("narrative central_question wiring", () => {
  it("prompt references the central question", () => {
    expect(buildNarrativeSystem("medium").toLowerCase()).toContain("central question");
  });
});
```

> Rationale: `redactForNarrative` is not exported, so we assert the prompt-level contract here and rely on the server typecheck (Step 6) to prove `ls.central_question` is a valid field on `LogicStructure`. Do not export the private function just to test it.

- [ ] **Step 6: Run tests + typecheck**

Run:
```bash
pnpm --filter @mysterio/server test src/services/generation/prompts/narrative.system.test.ts src/services/generation/agents/narrativeAgent.redact.test.ts
pnpm --filter @mysterio/server typecheck
```
Expected: PASS; typecheck clean (proves `central_question` exists on `LogicStructure`).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/generation/prompts/narrative.system.ts apps/server/src/services/generation/prompts/narrative.system.test.ts apps/server/src/services/generation/agents/narrativeAgent.ts apps/server/src/services/generation/agents/narrativeAgent.redact.test.ts
git commit -m "feat: narrative prompt uses PROSE_CRAFT + states central question early"
```

---

### Task 6: Pure `buildDebugView` helper (full structure + clue-coverage + metrics)

**Files:**
- Create: `apps/server/src/routes/debugView.ts`
- Test: `apps/server/src/routes/debugView.test.ts`

This pure function turns a stored mystery row into the debug DTO. Keeping it pure makes the coverage/metrics logic unit-testable without booting Fastify.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/debugView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDebugView, type DebugRow } from "./debugView.js";

function makeLogic() {
  return {
    category: "missing-pet",
    setting: "A sunny backyard with a rabbit hutch.",
    central_question: "Who took Rosie and how did they get past the gate?",
    characters: [
      { id: "you", name: "Mia", role: "detective", description: "The young detective.", is_culprit: false, motive: null },
      { id: "theo", name: "Theo", role: "suspect", description: "Lives past the back fence.", is_culprit: true, motive: "He wanted a pet of his own." },
    ],
    essential_clues: [
      { id: "clover-trail", description: "A trail of fresh clover sprigs leads to a gap in the back fence.", category_type: "event" },
      { id: "open-latch", description: "The hutch latch was lifted, not broken.", category_type: "item" },
    ],
    false_clues: [{ id: "spooked-cat", description: "The neighbor's cat was seen on the shed roof." }],
    true_solution: { who_did_it: "theo", how: "He lifted the latch and lured Rosie with clover.", why: "He wanted a pet." },
    how_distractors: ["A fox dug under.", "The latch broke.", "Theo left the door open by accident."],
    why_distractors: ["For a prank.", "To sell her.", "Because he was angry."],
    logic_chain: ["Clover trail leads to the fence gap.", "Latch was lifted by a person.", "Theo lives past the fence and wanted a pet."],
  };
}

const baseRow: DebugRow = {
  id: "m1",
  status: "ready",
  difficulty: "easy",
  failure_reason: null,
  logic_structure_json: JSON.stringify(makeLogic()),
  narrative_text:
    "Mia knelt by the hutch. A trail of fresh clover sprigs led to a gap in the back fence. The hutch latch was lifted, not broken. The neighbor's cat watched from the shed roof.",
  validation_passed: 1,
  validation_attempts: 2,
  validation_notes: "who/how/why all matched",
};

describe("buildDebugView", () => {
  it("returns the full parsed logic structure", () => {
    const v = buildDebugView(baseRow);
    expect(v.logic_structure?.true_solution.who_did_it).toBe("theo");
    expect(v.logic_structure?.central_question).toContain("Rosie");
  });

  it("computes clue coverage: present clues flagged present, absent ones not", () => {
    const v = buildDebugView(baseRow);
    const byId = Object.fromEntries(v.clue_coverage.map((c) => [c.id, c]));
    expect(byId["clover-trail"].present).toBe(true);
    expect(byId["open-latch"].present).toBe(true);
  });

  it("flags a missing essential clue", () => {
    const logic = makeLogic();
    const row = { ...baseRow, logic_structure_json: JSON.stringify(logic), narrative_text: "Mia knelt by the hutch and saw nothing unusual at all today." };
    const v = buildDebugView(row);
    const byId = Object.fromEntries(v.clue_coverage.map((c) => [c.id, c]));
    expect(byId["clover-trail"].present).toBe(false);
  });

  it("reports validation + metrics", () => {
    const v = buildDebugView(baseRow);
    expect(v.validation).toEqual({ passed: true, attempts: 2, notes: "who/how/why all matched" });
    expect(v.metrics.essential_count).toBe(2);
    expect(v.metrics.false_count).toBe(1);
    expect(v.metrics.difficulty).toBe("easy");
    expect(v.metrics.target_words).toBe(600);
    expect(v.metrics.word_count).toBeGreaterThan(0);
  });

  it("handles a row with no logic_structure_json", () => {
    const v = buildDebugView({ ...baseRow, logic_structure_json: null, narrative_text: null });
    expect(v.logic_structure).toBeNull();
    expect(v.clue_coverage).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @mysterio/server test src/routes/debugView.test.ts`
Expected: FAIL — `Cannot find module './debugView.js'`.

- [ ] **Step 3: Implement the helper**

Create `apps/server/src/routes/debugView.ts`:

```ts
import { type DifficultyId, type LogicStructure, difficultyConfig } from "@mysterio/shared";
import { tokenSetRatio } from "../services/generation/textMatch.js";

const COVERAGE_THRESHOLD = 0.75; // matches the narrative agent's clue-coverage gate

export interface DebugRow {
  id: string;
  status: string;
  difficulty: string;
  failure_reason: string | null;
  logic_structure_json: string | null;
  narrative_text: string | null;
  validation_passed: number | null;
  validation_attempts: number;
  validation_notes: string | null;
}

export interface ClueCoverage {
  id: string;
  description: string;
  present: boolean;
  score: number;
}

export interface DebugView {
  id: string;
  status: string;
  failure_reason: string | null;
  logic_structure: LogicStructure | null;
  validation: { passed: boolean | null; attempts: number; notes: string | null };
  clue_coverage: ClueCoverage[];
  metrics: {
    difficulty: string;
    essential_count: number;
    false_count: number;
    word_count: number;
    target_words: number | null;
    min_words: number | null;
    max_words: number | null;
  };
}

function parseLogic(json: string | null): LogicStructure | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LogicStructure;
  } catch {
    return null;
  }
}

export function buildDebugView(row: DebugRow): DebugView {
  const logic = parseLogic(row.logic_structure_json);
  const narrative = row.narrative_text ?? "";

  const clue_coverage: ClueCoverage[] =
    logic && narrative
      ? logic.essential_clues.map((c) => {
          const score = tokenSetRatio(c.description, narrative);
          return { id: c.id, description: c.description, present: score >= COVERAGE_THRESHOLD, score };
        })
      : [];

  let target_words: number | null = null;
  let min_words: number | null = null;
  let max_words: number | null = null;
  try {
    const d = difficultyConfig(row.difficulty as DifficultyId);
    target_words = d.targetWords;
    min_words = Math.round(d.targetWords * (1 - d.wordToleranceFraction));
    max_words = Math.round(d.targetWords * (1 + d.wordToleranceFraction));
  } catch {
    /* unknown difficulty — leave null */
  }

  const word_count = narrative ? narrative.trim().split(/\s+/).filter(Boolean).length : 0;

  return {
    id: row.id,
    status: row.status,
    failure_reason: row.failure_reason,
    logic_structure: logic,
    validation: {
      passed: row.validation_passed === null ? null : row.validation_passed === 1,
      attempts: row.validation_attempts,
      notes: row.validation_notes,
    },
    clue_coverage,
    metrics: {
      difficulty: row.difficulty,
      essential_count: logic?.essential_clues.length ?? 0,
      false_count: logic?.false_clues.length ?? 0,
      word_count,
      target_words,
      min_words,
      max_words,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/routes/debugView.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/debugView.ts apps/server/src/routes/debugView.test.ts
git commit -m "feat: pure buildDebugView helper (structure + clue-coverage + metrics)"
```

---

### Task 7: Wire `central_question` into public GET + add the `/debug` endpoint

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts`

- [ ] **Step 1: Add `central_question` to the public GET DTO**

In `apps/server/src/routes/mysteries.ts`, inside the existing `GET /mysteries/:id` handler, extend the `logic_structure_json` parse block to also pull `central_question`. Replace the current parse block (the `let characters: unknown = undefined; if (row.logic_structure_json) {...}` section) with:

```ts
    let characters: unknown = undefined;
    let central_question: string | null = null;
    if (row.logic_structure_json) {
      try {
        const parsed = JSON.parse(row.logic_structure_json) as {
          characters?: unknown;
          central_question?: unknown;
        };
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.characters)) {
          characters = parsed.characters.map((c: Record<string, unknown>) => ({
            id: c.id, name: c.name, role: c.role, description: c.description,
          }));
        }
        if (typeof parsed.central_question === "string") {
          central_question = parsed.central_question;
        }
      } catch { /* swallow — surface as missing */ }
    }
```

Then add `central_question` to the returned object (it is the non-spoiler objective — safe for the public DTO):

```ts
      audio_url: row.audio_path ? `/audio/${row.audio_path}` : null,
      characters,
      central_question,
      created_at: row.created_at,
```

- [ ] **Step 2: Add the debug endpoint**

Add the import near the top of `apps/server/src/routes/mysteries.ts`:
```ts
import { buildDebugView } from "./debugView.js";
```

Add this route inside `mysteriesRoutes`, after the `GET /mysteries/:id` handler:

```ts
  app.get<{ Params: { id: string } }>("/mysteries/:id/debug", async (req, reply) => {
    const db = getDb();
    const row = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    return buildDebugView({
      id: row.id,
      status: row.status,
      difficulty: row.difficulty,
      failure_reason: row.failure_reason,
      logic_structure_json: row.logic_structure_json,
      narrative_text: row.narrative_text,
      validation_passed: row.validation_passed,
      validation_attempts: row.validation_attempts,
      validation_notes: row.validation_notes,
    });
  });
```

- [ ] **Step 3: Typecheck + run the full server suite**

Run:
```bash
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: typecheck clean; all tests pass (the new debugView tests + everything prior). If any pre-existing test built a `LogicStructure` fixture without `central_question` (e.g. compareSolutions or orchestrator tests), add `central_question: "..."` to that fixture — it is now required.

- [ ] **Step 4: Manual sanity (optional, no commit)**

If a dev DB has a ready mystery, after starting the server: `curl -s localhost:3000/api/mysteries/<id>/debug | head -c 400` shows the full structure + coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/mysteries.ts
git commit -m "feat: expose central_question on GET + add /mysteries/:id/debug endpoint"
```

---

### Task 8: `settingsStore` (web)

**Files:**
- Create: `apps/web/src/state/settingsStore.ts`
- Test: `apps/web/src/state/settingsStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/state/settingsStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore.js";

describe("settingsStore", () => {
  beforeEach(() => useSettingsStore.setState({ debugEnabled: false }));

  it("defaults debugEnabled to false", () => {
    expect(useSettingsStore.getState().debugEnabled).toBe(false);
  });

  it("toggles debugEnabled", () => {
    useSettingsStore.getState().setDebugEnabled(true);
    expect(useSettingsStore.getState().debugEnabled).toBe(true);
  });
});
```

> If the web package has no Vitest config, mirror however `playerStore` is tested. If `playerStore` has no test, still create this test; run it with `pnpm --filter @mysterio/web test src/state/settingsStore.test.ts`. If the web package genuinely has no test runner, skip Steps 1-2 and 5's test run, keep the store + the typecheck/build gate, and note it in your report.

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @mysterio/web test src/state/settingsStore.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create the store**

Create `apps/web/src/state/settingsStore.ts` (mirrors `playerStore.ts`):

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  debugEnabled: boolean;
  setDebugEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      debugEnabled: false,
      setDebugEnabled: (v) => set({ debugEnabled: v }),
    }),
    { name: "mysterio.settings" },
  ),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/web test src/state/settingsStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/state/settingsStore.ts apps/web/src/state/settingsStore.test.ts
git commit -m "feat: web settingsStore with persisted debugEnabled toggle"
```

---

### Task 9: Settings screen + route + gear entry point (web)

**Files:**
- Create: `apps/web/src/screens/SettingsScreen/SettingsScreen.tsx`
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx`

- [ ] **Step 1: Create the Settings screen**

Create `apps/web/src/screens/SettingsScreen/SettingsScreen.tsx`:

```tsx
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../state/settingsStore.js";

export function SettingsScreen() {
  const debugEnabled = useSettingsStore((s) => s.debugEnabled);
  const setDebugEnabled = useSettingsStore((s) => s.setDebugEnabled);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Settings</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back</Link>
      </header>

      <div
        style={{
          background: "var(--surface)",
          padding: 16,
          borderRadius: "var(--radius)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>🐞 Debug mode</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            Shows the solution, logic tree, and quality checks on each mystery. Spoilers — turn off before a kid plays.
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={debugEnabled}
            onChange={(e) => setDebugEnabled(e.target.checked)}
            style={{ width: 24, height: 24 }}
            aria-label="Enable debug mode"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/web/src/routes.tsx`, add the import and the route:

```tsx
import { SettingsScreen } from "./screens/SettingsScreen/SettingsScreen.js";
```
```tsx
      <Route path="/mysteries/:id/solve" element={<SolutionScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
```

- [ ] **Step 3: Add a gear entry point on MainScreen**

In `apps/web/src/screens/MainScreen/MainScreen.tsx`, add the import:
```tsx
import { Link } from "react-router-dom";
```
> Note: `useNavigate` is already imported from `react-router-dom`; add `Link` to that same import line instead of a duplicate import, e.g. `import { Link, useNavigate } from "react-router-dom";`.

Then in the header, add a gear link next to the "Switch player" button. Replace the header block with:

```tsx
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mysterio</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <button
            onClick={clearPlayer}
            style={{ background: "transparent", color: "var(--text-dim)", fontSize: 14 }}
          >
            {player?.name ?? "?"} · Switch player
          </button>
          <Link to="/settings" aria-label="Settings" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 18 }}>
            ⚙️
          </Link>
        </div>
      </header>
```

- [ ] **Step 4: Typecheck + build**

Run:
```bash
pnpm --filter @mysterio/web typecheck
pnpm --filter @mysterio/web build
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/SettingsScreen/SettingsScreen.tsx apps/web/src/routes.tsx apps/web/src/screens/MainScreen/MainScreen.tsx
git commit -m "feat: Settings screen with Debug toggle + gear entry on MainScreen"
```

---

### Task 10: Web API — `central_question` on MysteryDetail + `getMysteryDebug`

**Files:**
- Modify: `apps/web/src/api/mysteries.ts`

- [ ] **Step 1: Add `central_question` to `MysteryDetail`**

In `apps/web/src/api/mysteries.ts`, add the field to the `MysteryDetail` interface (after `audio_url`):

```ts
  audio_url: string | null;
  central_question: string | null;
  characters?: PublicCharacter[];
```

- [ ] **Step 2: Add the debug type + fetcher**

Add to `apps/web/src/api/mysteries.ts` (import `LogicStructure` from shared at the top):

```ts
import type { CategoryId, DifficultyId, LogicStructure, MysterySummary, MysteryStatus, NarrativeAnnotation } from "@mysterio/shared";
```

```ts
export interface ClueCoverage {
  id: string;
  description: string;
  present: boolean;
  score: number;
}

export interface MysteryDebug {
  id: string;
  status: MysteryStatus;
  failure_reason: string | null;
  logic_structure: LogicStructure | null;
  validation: { passed: boolean | null; attempts: number; notes: string | null };
  clue_coverage: ClueCoverage[];
  metrics: {
    difficulty: string;
    essential_count: number;
    false_count: number;
    word_count: number;
    target_words: number | null;
    min_words: number | null;
    max_words: number | null;
  };
}

export function getMysteryDebug(id: string): Promise<MysteryDebug> {
  return api(`/api/mysteries/${id}/debug`);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean. (`LogicStructure` is exported from `@mysterio/shared`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/mysteries.ts
git commit -m "feat: web API types for central_question + getMysteryDebug"
```

---

### Task 11: DebugPanel component (web)

**Files:**
- Create: `apps/web/src/screens/PlaybackScreen/DebugPanel/DebugPanel.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/screens/PlaybackScreen/DebugPanel/DebugPanel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getMysteryDebug, type MysteryDebug } from "../../../api/mysteries.js";

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px dashed var(--text-dim)",
  borderRadius: "var(--radius)",
  padding: 12,
  marginTop: 16,
  fontSize: 13,
};
const h: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", margin: "12px 0 4px" };
const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" };

export function DebugPanel({ mysteryId }: { mysteryId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["debug", mysteryId],
    queryFn: () => getMysteryDebug(mysteryId),
  });

  return (
    <details style={box}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>🐞 Debug</summary>
      {isLoading && <p>Loading debug…</p>}
      {isError && <p style={{ color: "var(--bad)" }}>Failed to load debug data.</p>}
      {data && <DebugBody d={data} />}
    </details>
  );
}

function DebugBody({ d }: { d: MysteryDebug }) {
  const ls = d.logic_structure;
  const culprit = ls?.characters.find((c) => c.is_culprit);
  const missing = d.clue_coverage.filter((c) => !c.present);

  return (
    <div>
      {!ls && <p>No logic structure yet (status: {d.status}).</p>}

      {ls && (
        <>
          <div style={h}>Case &amp; solution</div>
          <div><b>Question:</b> {ls.central_question}</div>
          <div><b>WHO:</b> {culprit ? `${culprit.name} (${culprit.id})` : ls.true_solution.who_did_it}</div>
          <div><b>HOW:</b> {ls.true_solution.how}</div>
          <div><b>WHY:</b> {ls.true_solution.why}</div>

          <div style={h}>Logic tree — characters</div>
          {ls.characters.map((c) => (
            <div key={c.id}>
              {c.is_culprit ? "🔴 " : "• "}<b>{c.name}</b> ({c.role}){c.motive ? ` — motive: ${c.motive}` : ""}
            </div>
          ))}

          <div style={h}>Essential clues</div>
          {ls.essential_clues.map((c) => (
            <div key={c.id}>• [{c.id}] {c.description}</div>
          ))}
          <div style={h}>False clues</div>
          {ls.false_clues.map((c) => (
            <div key={c.id}>• [{c.id}] {c.description}</div>
          ))}

          <div style={h}>Solve path</div>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {ls.logic_chain.map((step, i) => (<li key={i}>{step}</li>))}
          </ol>
        </>
      )}

      <div style={h}>Clue coverage (does each essential clue appear in the story?)</div>
      {d.clue_coverage.length === 0 && <div>n/a</div>}
      {d.clue_coverage.map((c) => (
        <div key={c.id} style={{ color: c.present ? "var(--text)" : "var(--bad)" }}>
          {c.present ? "✓" : "✗"} [{c.id}] score {c.score.toFixed(2)}
        </div>
      ))}
      {missing.length > 0 && (
        <div style={{ color: "var(--bad)", fontWeight: 700, marginTop: 4 }}>
          ⚠ {missing.length} essential clue(s) missing from the story prose — this mystery may be unsolvable.
        </div>
      )}

      <div style={h}>Validation</div>
      <div>passed: {String(d.validation.passed)} · attempts: {d.validation.attempts}</div>
      {d.validation.notes && <div style={mono}>{d.validation.notes}</div>}

      <div style={h}>Difficulty metrics</div>
      <div>
        {d.metrics.difficulty} · essential {d.metrics.essential_count} · false {d.metrics.false_count} · words {d.metrics.word_count}
        {d.metrics.target_words ? ` (target ${d.metrics.min_words}-${d.metrics.max_words})` : ""}
      </div>

      {ls && (
        <>
          <div style={h}>Distractor options</div>
          <div><b>HOW distractors:</b></div>
          {ls.how_distractors.map((s, i) => (
            <div key={i} style={{ color: culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "var(--bad)" : "var(--text)" }}>
              • {s}{culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "  ⚠ names culprit" : ""}
            </div>
          ))}
          <div><b>WHY distractors:</b></div>
          {ls.why_distractors.map((s, i) => (
            <div key={i} style={{ color: culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "var(--bad)" : "var(--text)" }}>
              • {s}{culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "  ⚠ names culprit" : ""}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run:
```bash
pnpm --filter @mysterio/web typecheck
pnpm --filter @mysterio/web build
```
Expected: both clean. (If `React.CSSProperties` triggers a "React UMD global" error, add `import type { CSSProperties } from "react";` and use `CSSProperties` instead of `React.CSSProperties` — match how sibling components like `AnnotatedNarrative.tsx` import it.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/PlaybackScreen/DebugPanel/DebugPanel.tsx
git commit -m "feat: DebugPanel — logic tree, solve path, coverage, validation, metrics, distractors"
```

---

### Task 12: Wire central_question + DebugPanel into PlaybackScreen & BriefingCard

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`

- [ ] **Step 1: Show `central_question` on the BriefingCard**

In `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`, replace the static "Your job" line with the central question when present:

```tsx
        <div style={{ fontSize: 14, color: "var(--text)", margin: "16px 0", lineHeight: 1.5 }}>
          {mystery.central_question ? (
            <><b>Your case:</b> {mystery.central_question}</>
          ) : (
            <>Your job: figure out <b>who</b> did it, <b>how</b>, and <b>why</b>.</>
          )}
        </div>
```

- [ ] **Step 2: Show `central_question` + DebugPanel on PlaybackScreen**

In `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`:

(a) Add imports:
```tsx
import { useSettingsStore } from "../../state/settingsStore.js";
import { DebugPanel } from "./DebugPanel/DebugPanel.js";
```

(b) Read the toggle inside the component (near the other hooks):
```tsx
  const debugEnabled = useSettingsStore((s) => s.debugEnabled);
```

(c) In the rendered story view, add the case-objective line under the title and the DebugPanel after the AnnotatedNarrative. Update the block (currently the `<h1>` + hint `<p>` + optional `<audio>` + `<AnnotatedNarrative>`) so it reads:

```tsx
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.title}</h1>
        {data.central_question && (
          <p style={{ fontSize: 15, color: "var(--text)", marginBottom: 8 }}>
            <b>Your case:</b> {data.central_question}
          </p>
        )}
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
          Tap a highlighted name or clue to add it to your notes.
        </p>
        {data.audio_url && (
          <audio
            src={data.audio_url}
            controls
            preload="metadata"
            playsInline
            style={{ width: "100%", marginBottom: 16 }}
          />
        )}
        <AnnotatedNarrative
          text={text}
          annotations={annotations}
          onTap={(a) => tapAnnotation.mutate(a)}
        />
        {debugEnabled && <DebugPanel mysteryId={mysteryId} />}
```

> If the `<audio>` block is not present (in case M3.3 differs), just keep the existing JSX between the hint `<p>` and `<AnnotatedNarrative>` and add the two new pieces: the `central_question` line after the `<h1>`, and `{debugEnabled && <DebugPanel mysteryId={mysteryId} />}` after `<AnnotatedNarrative>`.

- [ ] **Step 3: Typecheck + build**

Run:
```bash
pnpm --filter @mysterio/web typecheck
pnpm --filter @mysterio/web build
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx
git commit -m "feat: show central_question on briefing/playback + DebugPanel when debug on"
```

---

### Task 13: Full-stack verification (local smoke)

**Files:** none (manual verification only).

- [ ] **Step 1: Build shared + run all unit suites**

Run:
```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/shared test
pnpm --filter @mysterio/server test
pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build
```
Expected: all green. Fix any fixture that needs the new required `central_question` field.

- [ ] **Step 2: Start dev + generate a fresh mystery**

Run `pnpm --filter @mysterio/server dev` (and the web dev server, or use curl). Generate an Easy missing-pet mystery (`POST /api/mysteries/generate {player_id:"p1",category:"missing-pet",difficulty:"easy"}`), poll until `ready`.

- [ ] **Step 3: Verify central_question + debug endpoint**

```bash
curl -s localhost:3000/api/mysteries/<id> | grep -o '"central_question":"[^"]*"' | head
curl -s localhost:3000/api/mysteries/<id>/debug | head -c 600
```
Expected: a non-empty `central_question` that does NOT name the culprit; the debug payload shows the full structure, `clue_coverage` (all `present:true` for a healthy mystery), validation, and metrics.

- [ ] **Step 4: Verify the UI**

In the browser: confirm the BriefingCard shows "Your case: …"; PlaybackScreen shows it under the title. Open Settings (gear), enable Debug, return to the mystery, expand the 🐞 Debug panel, confirm all sections render and clue-coverage shows ✓ for each essential clue. Toggle Debug off → panel disappears.

- [ ] **Step 5: No commit (verification only).**

---

### Task 14: Deploy + PR (user-gated)

**Files:** none directly.

- [ ] **Step 1:** Confirm clean tree (`git status`).
- [ ] **Step 2:** `git push -u origin feat/debug-story-quality`
- [ ] **Step 3:** Desktop smoke against the deployed VM after `./scripts/deploy.sh` (generate a mystery, hit `/api/mysteries/<id>/debug`, confirm central_question + coverage).
- [ ] **Step 4:** `gh pr create --base main` with a summary covering: Debug endpoint + Settings toggle + DebugPanel; central_question; difficulty misdirection; craft guidance. Note the client-toggle spoiler caveat.

> This task is user-gated (deploy + PR are outward-facing). Pause and confirm with the user before running it, the same way M3.3 did.

---

## Out of scope (do not implement)

- Real auth / PIN on the debug endpoint (client-toggle only).
- Graphical tree-diagram visualization.
- Regenerate/edit-from-debug.
- Backfilling `central_question` onto pre-existing mysteries.
- Threading `central_question` through `redact()` into the validation agent (deliberately omitted — it reaches storage + DTOs via the full stored structure, and keeping it out of the validator avoids perturbing the M2.8 pass-rate).
