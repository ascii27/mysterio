# Age-Range → Generation (Spec 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread each detective's `age_range` band into mystery generation so prose reading level, the solvability benchmark, and clue subtlety match the kid's age; record `target_age_range` on the mystery and show a "Written for ages X–Y" badge.

**Architecture:** Mirror the existing **difficulty** plumbing. A new `AGE_BANDS` config in `packages/shared` (parallel to `DIFFICULTIES`) carries per-band prose guidance. The band flows `POST /mysteries/generate` → `runGeneration` → logic/narrative/prose-solver prompt builders. It is **server-derived from the detective** (the route already 404s on a missing player, so `player.age_range` is always present) — the client never sends it. A nullable `mysteries.target_age_range` column (native `ADD COLUMN`, no table rebuild) records it for the badge.

**Tech Stack:** TypeScript, pnpm monorepo, Fastify, Drizzle + better-sqlite3 (SQLite), Vitest, React + Vite. Spec: `docs/superpowers/specs/2026-06-04-detective-age-generation-design.md`.

**Conventions:**
- Server tests: `vitest run` via `pnpm --filter @mysterio/server test`. Shared: `pnpm --filter @mysterio/shared test`.
- In-memory DB harness: `apps/server/src/test/db.ts` (`setupTestDb()` in `beforeEach`; already migrates with `foreign_keys=OFF`).
- Web has no test runner — gate is `pnpm --filter @mysterio/web typecheck` + `pnpm --filter @mysterio/web build`. Verify the badge visually in a real browser, not curl.
- ESM imports use `.js` extensions even for `.ts` sources. Commit messages prefix `M-2b:`.

**Branch:** `feat/detective-age-generation` (already created off `main`).

---

### Task 1: Age-band config in `packages/shared`

Adds the static `AGE_BANDS` array + `ageBandConfig()` accessor — the single source of per-band prose guidance. The shared barrel (`index.ts`) already does `export * from "./constants/ageRanges.js"`, so no barrel edit is needed.

**Files:**
- Modify: `packages/shared/src/constants/ageRanges.ts`
- Test: `packages/shared/src/constants/ageRanges.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/constants/ageRanges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AGE_RANGES, ageBandConfig } from "./ageRanges.js";

describe("ageBandConfig", () => {
  it("returns a config for every age range, with guidance copy", () => {
    for (const id of AGE_RANGES) {
      const b = ageBandConfig(id);
      expect(b.id).toBe(id);
      expect(typeof b.benchmarkAge).toBe("number");
      expect(b.vocabulary.length).toBeGreaterThan(10);
      expect(b.subtletyNudge.length).toBeGreaterThan(10);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it("benchmarkAge is the lower bound of the band", () => {
    expect(ageBandConfig("8-9").benchmarkAge).toBe(8);
    expect(ageBandConfig("10-11").benchmarkAge).toBe(10);
    expect(ageBandConfig("12-13").benchmarkAge).toBe(12);
  });

  it("subtlety scales: youngest leans obvious, oldest leans subtle", () => {
    expect(ageBandConfig("8-9").subtletyNudge.toLowerCase()).toContain("obvious");
    expect(ageBandConfig("12-13").subtletyNudge.toLowerCase()).toContain("subtle");
  });

  it("throws on an unknown age range", () => {
    expect(() => ageBandConfig("99-100" as never)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/shared test -- ageRanges`
Expected: FAIL — `ageBandConfig` is not exported.

- [ ] **Step 3: Implement the config**

Append to `packages/shared/src/constants/ageRanges.ts` (keep the existing `AGE_RANGES` / `AgeRange` / `DEFAULT_AGE_RANGE` exports):

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/shared test -- ageRanges`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the shared package**

Run: `pnpm --filter @mysterio/shared build`
Expected: no errors (the `dist/` is what the server/web import).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/ageRanges.ts packages/shared/src/constants/ageRanges.test.ts
git commit -m "M-2b: AGE_BANDS config + ageBandConfig (per-band prose guidance)"
```

---

### Task 2: Neutralize the cached `SAFETY_PREAMBLE` vocabulary line

`SAFETY_PREAMBLE` is sent as a `cache: true` block on every agent call. Keeping it band-neutral preserves a single cache variant; the per-call blocks (Tasks 3–5) carry band specifics. We only soften its hardcoded "eight-year-old" vocabulary floor so it does not contradict the 12-13 guidance.

**Files:**
- Modify: `apps/server/src/services/generation/prompts/shared.ts:13`
- Test: `apps/server/src/services/generation/prompts/shared.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/prompts/shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SAFETY_PREAMBLE } from "./shared.js";

describe("SAFETY_PREAMBLE", () => {
  it("stays age-band-neutral — no hardcoded eight-year-old vocabulary floor", () => {
    expect(SAFETY_PREAMBLE).not.toContain("eight-year-old");
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain("age-appropriate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- shared.test`
Expected: FAIL — preamble still contains "eight-year-old".

- [ ] **Step 3: Soften the line**

In `apps/server/src/services/generation/prompts/shared.ts`, replace the last bullet:

```
- Vocabulary should be readable by an eight-year-old, with occasional richer words for context.
```

with:

```
- Vocabulary must be age-appropriate for the target age band stated in the task below, never above a 13-year-old reading level.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test -- shared.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/prompts/shared.ts apps/server/src/services/generation/prompts/shared.test.ts
git commit -m "M-2b: keep SAFETY_PREAMBLE age-band-neutral (cache stays one variant)"
```

---

### Task 3: Logic-structure prompt + spine threading (route → orchestrator → logic agent)

This is the "spine" task: it establishes `ageRange` on `RunInput` and has the route supply it, then consumes it in the logic prompt. Narrative + prose-solver still use their old single-arg builders (unchanged) so the tree stays green.

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/routes/mysteries.ts`

- [ ] **Step 1: Update the prompt test (failing) to the new 2-arg signature + band assertions**

In `logicStructure.system.test.ts`, update every existing `buildLogicStructureSystem("X")` call to pass an age range (`buildLogicStructureSystem("X", "10-11")`), and add:

```ts
it("scales the solvability benchmark to the age band's lower bound", () => {
  expect(buildLogicStructureSystem("easy", "8-9")).toContain("careful 8-year-old");
  expect(buildLogicStructureSystem("easy", "12-13")).toContain("careful 12-year-old");
  expect(buildLogicStructureSystem("easy", "8-9")).not.toContain("eight-year-old");
});

it("injects the age-band subtlety nudge", () => {
  expect(buildLogicStructureSystem("easy", "8-9").toLowerCase()).toContain("obvious");
  expect(buildLogicStructureSystem("easy", "12-13").toLowerCase()).toContain("subtle");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- logicStructure.system`
Expected: FAIL — builder takes one arg / benchmark not scaled.

- [ ] **Step 3: Implement the prompt changes**

In `logicStructure.system.ts`:

Change the imports (line 1) to add the age-band helpers:

```ts
import { ageBandConfig, difficultyConfig, type AgeRange, type DifficultyId } from "@mysterio/shared";
```

Change the signature + add the band resolve:

```ts
export function buildLogicStructureSystem(difficulty: DifficultyId, ageRange: AgeRange): string {
  const d = difficultyConfig(difficulty);
  const b = ageBandConfig(ageRange);
```

Add an `AGE BAND` line directly under the existing `MISDIRECTION FOR THIS DIFFICULTY:` line (~line 11):

```
AGE BAND: ${ageRange} — ${b.subtletyNudge}
```

Replace the two "careful eight-year-old" occurrences:
- Line ~57: `...solvable from the essential_clues alone, by a careful eight-year-old, without...` → `...by a careful ${b.benchmarkAge}-year-old, without...`
- Line ~79: `A careful eight-year-old reading the clues should be able to rule them out...` → `A careful ${b.benchmarkAge}-year-old reading the clues should be able to rule them out...`

- [ ] **Step 4: Thread `ageRange` into the logic agent**

In `logicStructureAgent.ts`:

Add `AgeRange` to the imports (line 1–7 block):

```ts
  type AgeRange,
```

Add the field to `LogicStructureAgentInput` (after `difficulty`):

```ts
  ageRange: AgeRange;
```

Pass it to the builder (line ~35):

```ts
        { type: "text", text: buildLogicStructureSystem(input.difficulty, input.ageRange) },
```

- [ ] **Step 5: Thread `ageRange` through the orchestrator + route**

In `orchestrator.ts`:

Add `AgeRange` to the type import (line 2):

```ts
import type { AgeRange, CategoryId, DifficultyId, LogicStructure } from "@mysterio/shared";
```

Add to `RunInput` (after `difficulty`):

```ts
  ageRange: AgeRange;
```

Pass it to the logic agent (the `runLogicStructureAgent({...})` call, ~line 36):

```ts
      const logicRes = await runLogicStructureAgent({
        category: input.category,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        previousFailureNotes,
      });
```

In `routes/mysteries.ts`:

Add `AgeRange` to the type import (line 2 area — there is a `import type { ... } from "@mysterio/shared"`? No; add one):

```ts
import type { AgeRange } from "@mysterio/shared";
```

In the `void runGeneration({...})` call (~line 40), add the band (the route already loaded `player` and 404s if absent, so `player.age_range` is present):

```ts
    void runGeneration({
      mysteryId: id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      ageRange: player.age_range as AgeRange,
    });
```

- [ ] **Step 6: Run the prompt test + full server suite**

Run: `pnpm --filter @mysterio/server test -- logicStructure.system`
Expected: PASS.

Run: `pnpm --filter @mysterio/server test`
Expected: all PASS (no other caller of `buildLogicStructureSystem` / `runLogicStructureAgent` / `runGeneration` broke — `mysteriesList.test.ts` mocks `runGeneration`).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts apps/server/src/services/generation/prompts/logicStructure.system.test.ts apps/server/src/services/generation/agents/logicStructureAgent.ts apps/server/src/services/generation/orchestrator.ts apps/server/src/routes/mysteries.ts
git commit -m "M-2b: age band → logic-structure prompt (benchmark + subtlety); thread ageRange route→orchestrator→logic agent"
```

---

### Task 4: Narrative prompt + threading (orchestrator → readthrough → narrative agent)

`RunInput.ageRange` already exists (Task 3). Extend it to the narrative path.

**Files:**
- Modify: `apps/server/src/services/generation/prompts/narrative.system.ts`
- Modify: `apps/server/src/services/generation/prompts/narrative.system.test.ts`
- Modify: `apps/server/src/services/generation/agents/narrativeAgent.ts`
- Modify: `apps/server/src/services/generation/readthrough.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`

- [ ] **Step 1: Update the narrative prompt test (failing)**

In `narrative.system.test.ts`, update existing `buildNarrativeSystem("easy")` calls to `buildNarrativeSystem("easy", "10-11")`, and add:

```ts
it("targets the age band in the audience line", () => {
  expect(buildNarrativeSystem("easy", "8-9")).toContain("for ages 8-9");
  expect(buildNarrativeSystem("easy", "12-13")).toContain("for ages 12-13");
});

it("injects the age-band vocabulary guidance", () => {
  expect(buildNarrativeSystem("easy", "8-9")).toContain("Short, simple sentences");
  expect(buildNarrativeSystem("easy", "12-13")).toContain("Longer, varied sentences");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- narrative.system`
Expected: FAIL — builder takes one arg.

- [ ] **Step 3: Implement the prompt changes**

In `narrative.system.ts`:

Update imports (line 1):

```ts
import { ageBandConfig, difficultyConfig, type AgeRange, type DifficultyId } from "@mysterio/shared";
```

Change signature + resolve band:

```ts
export function buildNarrativeSystem(difficulty: DifficultyId, ageRange: AgeRange): string {
  const d = difficultyConfig(difficulty);
  const b = ageBandConfig(ageRange);
```

Change the opening line (~line 8) from `...mystery story for ages 8-13.` to:

```
You are a children's audiobook author writing a mystery story for ages ${ageRange}.
```

Replace the generic vocabulary bullet (~line 27) `- Use age-appropriate vocabulary with occasional richer words for flavor.` with:

```
- ${b.vocabulary}
```

- [ ] **Step 4: Thread `ageRange` into the narrative agent**

In `narrativeAgent.ts`:

Add `type AgeRange` to the import block (lines 1–5):

```ts
  type AgeRange,
```

Add to `NarrativeAgentInput` (after `difficulty`):

```ts
  ageRange: AgeRange;
```

Pass to the builder (~line 54):

```ts
          { type: "text", text: buildNarrativeSystem(input.difficulty, input.ageRange) },
```

- [ ] **Step 5: Thread through readthrough + orchestrator**

In `readthrough.ts`:

Add `AgeRange` to the type import (line 1):

```ts
import type { AgeRange, DifficultyId, LogicStructure, TrueSolution } from "@mysterio/shared";
```

Add to `WriteAndVerifyInput` (after `difficulty`):

```ts
  ageRange: AgeRange;
```

In the default `narrative` thunk inside `writeAndVerifyProse` (~line 99–107), pass `ageRange`:

```ts
      runNarrativeAgent({
        logicStructure: input.logicStructure,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        maxAttempts: input.maxNarrativeAttempts,
        extraNotes,
      }));
```

In `orchestrator.ts`, pass `ageRange` to `writeAndVerifyProse` (~line 74):

```ts
      const prose = await writeAndVerifyProse({
        logicStructure: logic,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        maxNarrativeAttempts: env.MAX_NARRATIVE_ATTEMPTS,
        maxReadthroughAttempts: env.MAX_READTHROUGH_ATTEMPTS,
      });
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @mysterio/server test -- narrative.system`
Expected: PASS.

Run: `pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/generation/prompts/narrative.system.ts apps/server/src/services/generation/prompts/narrative.system.test.ts apps/server/src/services/generation/agents/narrativeAgent.ts apps/server/src/services/generation/readthrough.ts apps/server/src/services/generation/orchestrator.ts
git commit -m "M-2b: age band → narrative prompt (vocabulary register); thread ageRange through readthrough"
```

---

### Task 5: Prose-solver prompt + threading (readthrough gate → solver)

Scales the readthrough-gate solver to the band's benchmark age, so each mystery must be solvable by the youngest reader in the band.

**Files:**
- Modify: `apps/server/src/services/generation/prompts/proseSolver.system.ts`
- Test: `apps/server/src/services/generation/prompts/proseSolver.system.test.ts` (create)
- Modify: `apps/server/src/services/generation/agents/proseSolverAgent.ts`
- Modify: `apps/server/src/services/generation/readthrough.ts`

- [ ] **Step 1: Write the failing prompt test**

Create `apps/server/src/services/generation/prompts/proseSolver.system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProseSolverSystem } from "./proseSolver.system.js";

describe("buildProseSolverSystem", () => {
  it("casts the solver as a reader at the band's benchmark age", () => {
    expect(buildProseSolverSystem("8-9")).toContain("sharp 8-year-old");
    expect(buildProseSolverSystem("12-13")).toContain("sharp 12-year-old");
  });

  it("no longer hardcodes a 12-year-old for the youngest band", () => {
    expect(buildProseSolverSystem("8-9")).not.toContain("12-year-old");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- proseSolver.system`
Expected: FAIL — `buildProseSolverSystem` is not exported.

- [ ] **Step 3: Convert the const to a builder**

Rewrite `proseSolver.system.ts` (keep the body text identical except the first line):

```ts
import { ageBandConfig, type AgeRange } from "@mysterio/shared";

export function buildProseSolverSystem(ageRange: AgeRange): string {
  const b = ageBandConfig(ageRange);
  return `You are a sharp ${b.benchmarkAge}-year-old detective reading a mystery story for the first time.

You will be given:
- THE CASE: the question the story asks you to solve.
- THE SUSPECTS: a list of characters, each with an id, name, role, and description.
- THE STORY: the full narration, exactly as a kid reads it.

Solve it using ONLY what the story tells you. You do NOT get a list of clues or the answer — you must notice the clues yourself, in the order they appear, and reason to a conclusion.

Decide:
- who: the id of the character who did it (copy an id from THE SUSPECTS exactly).
- how: in one or two sentences, how they did it, based on the story.
- why: in one or two sentences, their motive, based on the story.

Also rate your confidence from 0 (pure guess) to 1 (certain), and briefly explain your reasoning.

Respond with ONLY this JSON, no prose around it:
{
  "guess": { "who": "<character id>", "how": "<...>", "why": "<...>" },
  "reasoning": "<what in the story led you here>",
  "confidence": <number 0..1>
}`;
}
```

- [ ] **Step 4: Thread `ageRange` into the solver agent**

In `proseSolverAgent.ts`:

Replace the import of the const (line 2) with the builder + type (remove the old `import { PROSE_SOLVER_SYSTEM } ...` line):

```ts
import type { AgeRange } from "@mysterio/shared";
import { buildProseSolverSystem } from "../prompts/proseSolver.system.js";
```

(`ageBandConfig` is used inside the prompt builder, not here — do not import it in the agent, or `noUnusedLocals` typecheck will flag it.)

Add `ageRange` to `ProseSolverInput` (after `characters`):

```ts
  ageRange: AgeRange;
```

Use the builder in the `system` array (~line 42), keeping `cache: true` (still stable per band):

```ts
        { type: "text", text: buildProseSolverSystem(input.ageRange), cache: true },
```

- [ ] **Step 5: Thread `ageRange` into the readthrough gate**

In `readthrough.ts`:

Add to `ReadthroughInput` (after `narrativeText`):

```ts
  ageRange: AgeRange;
```

Pass it into the solver call inside `runReadthroughGate` (~line 43):

```ts
  const solved = await solver({
    centralQuestion: ls.central_question,
    narrativeText: input.narrativeText,
    characters,
    ageRange: input.ageRange,
  });
```

In the default `gate` thunk inside `writeAndVerifyProse` (~line 108–111), pass `ageRange` (already on `WriteAndVerifyInput` from Task 4):

```ts
    ((narrativeText: string) =>
      runReadthroughGate({ logicStructure: input.logicStructure, narrativeText, ageRange: input.ageRange }));
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @mysterio/server test -- proseSolver`
Expected: PASS.

Run: `pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck`
Expected: all PASS (any readthrough/proseSolver test that builds a `ReadthroughInput`/`ProseSolverInput` literal must now include `ageRange` — update those fixtures to `ageRange: "10-11"` if the suite flags them).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/generation/prompts/proseSolver.system.ts apps/server/src/services/generation/prompts/proseSolver.system.test.ts apps/server/src/services/generation/agents/proseSolverAgent.ts apps/server/src/services/generation/readthrough.ts
git commit -m "M-2b: scale readthrough prose-solver to the band's benchmark age"
```

---

### Task 6: Storage — `mysteries.target_age_range` column + migration 0004

Adds the nullable column. A plain `ADD COLUMN` with no new constraint emits a **native `ALTER TABLE`**, not a table rebuild — sidestepping the SQLite FK-cascade gotcha. A guard test asserts the generated SQL is an ALTER (no `__new_mysteries` rebuild).

**Files:**
- Modify: `apps/server/src/db/schema.ts:16-42` (the `mysteries` table)
- Generate: `apps/server/src/db/migrations/0004_*.sql` + `meta/_journal.json` (via drizzle-kit)
- Test: `apps/server/src/db/migration_target_age_range.test.ts` (create)

- [ ] **Step 1: Add the column to the schema**

In `apps/server/src/db/schema.ts`, inside the `mysteries` table, add after the `difficulty` line (line 19):

```ts
  target_age_range: text("target_age_range"),
```

(Nullable, no `.notNull()`, no CHECK — validated at the app layer, mirroring how `difficulty` is unconstrained text on this table aside from its existing check. Do NOT add a CHECK constraint: that would force a table rebuild.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: creates `apps/server/src/db/migrations/0004_<random>.sql` and updates `meta/_journal.json` + `meta/0004_snapshot.json`.

- [ ] **Step 3: Inspect the generated SQL (manual gate)**

Read the new `0004_*.sql`. It MUST be a single statement of the form:

```sql
ALTER TABLE `mysteries` ADD `target_age_range` text;
```

If instead it contains `CREATE TABLE \`__new_mysteries\`` / `DROP TABLE` (a rebuild), STOP — re-check that no CHECK constraint or other change crept into the schema edit, fix, and regenerate. A rebuild would risk the FK-cascade children and must not be committed.

- [ ] **Step 4: Write the failing guard test**

Create `apps/server/src/db/migration_target_age_range.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

describe("target_age_range migration", () => {
  it("adds the column via ALTER TABLE, not a table rebuild (preserves FK-cascade children)", () => {
    const sql = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`${DIR}/${f}`, "utf8"))
      .find((s) => s.includes("target_age_range"));
    expect(sql, "no migration adds target_age_range").toBeTruthy();
    expect(sql!).toContain("ALTER TABLE");
    expect(sql!).not.toContain("__new_mysteries");
  });
});
```

- [ ] **Step 5: Run the guard test**

Run: `pnpm --filter @mysterio/server test -- migration_target_age_range`
Expected: PASS (if it fails on `__new_mysteries`, the migration is a rebuild — return to Step 3).

- [ ] **Step 6: Run the full server suite**

Run: `pnpm --filter @mysterio/server test`
Expected: all PASS — `setupTestDb()` now applies 0004; existing inserts that omit `target_age_range` still work (nullable).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/migrations/0004_*.sql apps/server/src/db/migrations/meta/_journal.json apps/server/src/db/migrations/meta/0004_snapshot.json apps/server/src/db/migration_target_age_range.test.ts
git commit -m "M-2b: mysteries.target_age_range column (migration 0004, native ADD COLUMN)"
```

---

### Task 7: Persist + expose `target_age_range` (route insert + detail DTO)

The route stores the detective's band on the mystery row and the detail endpoint returns it; the web `MysteryDetail` type gains the field.

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts` (POST insert ~line 32; GET `/mysteries/:id` return ~line 81)
- Modify: `apps/web/src/api/mysteries.ts` (`MysteryDetail`)
- Test: `apps/server/src/routes/mysteriesGenerate.test.ts` (create)

- [ ] **Step 1: Write the failing route test**

Create `apps/server/src/routes/mysteriesGenerate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

vi.mock("../services/generation/orchestrator.js", () => ({ runGeneration: vi.fn() }));
vi.mock("../services/generation/agents/ttsAgent.js", () => ({ runTtsAgent: vi.fn() }));

import { runGeneration } from "../services/generation/orchestrator.js";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players, mysteries } from "../db/schema.js";
import { mysteriesRoutes } from "./mysteries.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  getDb().insert(players).values({ id: "p-young", name: "Kid", age_range: "8-9", default_difficulty: "easy" }).run();
  app = Fastify();
  await app.register(mysteriesRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); vi.clearAllMocks(); });

describe("POST /mysteries/generate — age band", () => {
  it("records the detective's age band and threads it to generation", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate",
      payload: { player_id: "p-young", category: "missing-pet", difficulty: "easy" },
    });
    expect(res.statusCode).toBe(202);
    const id = res.json().mystery_id;
    const row = getDb().select().from(mysteries).where(eq(mysteries.id, id)).get();
    expect(row?.target_age_range).toBe("8-9");
    expect(runGeneration).toHaveBeenCalledWith(expect.objectContaining({ ageRange: "8-9" }));
  });

  it("GET /mysteries/:id returns target_age_range", async () => {
    getDb().insert(mysteries).values({
      id: "m1", player_id: "p-young", category: "missing-pet",
      difficulty: "easy", status: "pending", target_age_range: "12-13",
    }).run();
    const res = await app.inject({ method: "GET", url: "/mysteries/m1" });
    expect(res.json().target_age_range).toBe("12-13");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- mysteriesGenerate`
Expected: FAIL — `row.target_age_range` is undefined / not stored and not in the GET response.

- [ ] **Step 3: Store the band on insert**

In `routes/mysteries.ts`, the POST insert (~line 32) — add the field:

```ts
    db.insert(mysteries).values({
      id,
      player_id: parsed.data.player_id,
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      target_age_range: player.age_range,
      status: "pending",
    }).run();
```

- [ ] **Step 4: Return the band from the detail endpoint**

In the `GET /mysteries/:id` return object (~line 81–97), add:

```ts
      difficulty: row.difficulty,
      target_age_range: row.target_age_range,
      status: row.status,
```

(insert `target_age_range` adjacent to `difficulty`).

- [ ] **Step 5: Add the field to the web DTO**

In `apps/web/src/api/mysteries.ts`, add `AgeRange` to the type import (line 1):

```ts
import type { AgeRange, CategoryId, DifficultyId, LogicStructure, MysterySummary, MysteryStatus, NarrativeAnnotation } from "@mysterio/shared";
```

Add to `MysteryDetail` (after `difficulty`):

```ts
  target_age_range: AgeRange | null;
```

- [ ] **Step 6: Run tests + typechecks**

Run: `pnpm --filter @mysterio/server test -- mysteriesGenerate`
Expected: PASS.

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/web typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/mysteries.ts apps/server/src/routes/mysteriesGenerate.test.ts apps/web/src/api/mysteries.ts
git commit -m "M-2b: persist target_age_range on generate + return it from detail DTO"
```

---

### Task 8: Expose `target_age_range` in the list endpoint + `MysterySummary`

The shared-pool list needs the band so the card badge can render.

**Files:**
- Modify: `packages/shared/src/types/mystery.ts` (`MysterySummary`)
- Modify: `apps/server/src/routes/mysteries.ts` (GET `/mysteries` select ~line 144)
- Modify: `apps/server/src/routes/mysteriesList.test.ts`

- [ ] **Step 1: Add the assertion to the list test (failing)**

In `mysteriesList.test.ts`, update the `m-ready` seed insert (line 20) to include a band:

```ts
db.insert(mysteries).values({ id: "m-ready", player_id: "p-a", category: "missing-pet", difficulty: "easy", status: "ready", target_age_range: "12-13" }).run();
```

Add a test:

```ts
it("returns target_age_range for the badge", async () => {
  const a = await list("p-a");
  const ready = a.find((m) => m.id === "m-ready") as unknown as { target_age_range: string | null };
  expect(ready.target_age_range).toBe("12-13");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test -- mysteriesList`
Expected: FAIL — `target_age_range` is undefined in list rows.

- [ ] **Step 3: Add the column to the list select**

In `routes/mysteries.ts`, the `GET /mysteries` select object (~line 144), add after `difficulty`:

```ts
      difficulty: mysteries.difficulty,
      target_age_range: mysteries.target_age_range,
      status: mysteries.status,
```

- [ ] **Step 4: Add the field to the shared summary type**

In `packages/shared/src/types/mystery.ts`, add to `MysterySummary` (after `difficulty`):

```ts
  target_age_range: AgeRange | null;
```

(`AgeRange` is already imported at the top of this file.)

- [ ] **Step 5: Run tests + typechecks + rebuild shared**

Run: `pnpm --filter @mysterio/shared build`
Run: `pnpm --filter @mysterio/server test -- mysteriesList`
Expected: PASS.

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/mystery.ts apps/server/src/routes/mysteries.ts apps/server/src/routes/mysteriesList.test.ts
git commit -m "M-2b: expose target_age_range in list endpoint + MysterySummary"
```

---

### Task 9: "Written for ages X–Y" badge (web)

Renders the band on the shared-pool list cards and the briefing card. Hidden when `target_age_range` is null (pre-2b mysteries). No web test runner — gated by typecheck + build, then verified in a browser.

**Files:**
- Modify: `apps/web/src/screens/MainScreen/RecentList.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`

- [ ] **Step 1: Add the badge to the list cards**

In `RecentList.tsx`, add `ageBandConfig` to the shared import:

```ts
import { ageBandConfig } from "@mysterio/shared";
```

Replace the title + chip row (lines 37–38):

```tsx
              <span style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{m.title ?? "Untitled"}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                {m.target_age_range && <Chip tone="ink">Ages {ageBandConfig(m.target_age_range).label}</Chip>}
                {chip}
              </span>
```

- [ ] **Step 2: Add the badge to the briefing card**

In `BriefingCard.tsx`, add the import:

```ts
import { ageBandConfig } from "@mysterio/shared";
```

Directly under the title `<div>` (after line 42, the `{mystery.title ?? "Untitled Mystery"}` block closes), add:

```tsx
        {mystery.target_age_range && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 6 }}>
            Written for ages {ageBandConfig(mystery.target_age_range).label}
          </div>
        )}
```

- [ ] **Step 3: Typecheck + build the web app**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: no errors.

Run: `pnpm --filter @mysterio/web build`
Expected: vite build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/MainScreen/RecentList.tsx apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx
git commit -m "M-2b: 'Written for ages X–Y' badge on story list + briefing card"
```

- [ ] **Step 5: Browser verification (manual)**

Run the app (`pnpm dev` or the project's run skill). As a detective with a known band, generate or open a mystery and confirm:
- The list card shows `Ages 8–9` (etc.) next to the status chip.
- The briefing card shows "Written for ages X–Y" under the title.
- A pre-2b mystery (no `target_age_range`) shows **no** age badge (not "Ages null").

---

## Final verification (after all tasks)

- [ ] `pnpm --filter @mysterio/shared test && pnpm --filter @mysterio/shared build`
- [ ] `pnpm --filter @mysterio/server test`
- [ ] `pnpm --filter @mysterio/server typecheck`
- [ ] `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
- [ ] **M-2b live smoke (LLM cost — coordinate with the user):** generate one mystery per band at the same difficulty; confirm reading level visibly differs and each is solvable by its benchmark age. This is the tuning checkpoint for the `vocabulary` / `subtletyNudge` copy in `ageRanges.ts` (a one-file edit if tuning is needed).

## Notes for the implementer

- **Out of scope (do not touch):** `explanation.system.ts`, `hint.system.ts` (post-game reading — band-agnostic in 2b), and `services/images/style.ts` (cover-image safety, unrelated to reading level).
- **Server-derived, not client-sent:** the generate request body is unchanged; never add `age_range` to `generateBody`. The band comes from `player.age_range`.
- **Watch for fixture breakage:** changing `ProseSolverInput` / `ReadthroughInput` / `WriteAndVerifyInput` / `NarrativeAgentInput` / `LogicStructureAgentInput` shapes (required `ageRange`) will surface in any existing readthrough/agent unit tests that build those literals — add `ageRange: "10-11"` to such fixtures. Run the full server suite after Tasks 3–5 to catch them.
