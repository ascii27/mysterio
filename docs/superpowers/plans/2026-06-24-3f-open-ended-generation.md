# Spec 3f — Open-ended Case Generation + One-tap Start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 4-category + difficulty picker with a single "Start a new case" button that asks the AI to invent any kid-appropriate Maple Hollow mystery (involving ≥1 town resident), calibrated to the detective's saved difficulty + age preset.

**Architecture:** The `LogicStructure.category` enum becomes a free-text `case_type` string. The generate route drops `category`/`difficulty` from its contract and reads the player's `default_difficulty` + `age_range` presets instead. The orchestrator enforces a new "≥1 roster resident" gate via the existing `previousFailureNotes` regeneration loop, passes a list of the player's recent `case_type`s as an anti-repetition hint, and copies the invented `case_type` into the `mysteries.category` text column (no DB migration). The web home screen collapses to one button.

**Tech Stack:** pnpm monorepo, TypeScript. `packages/shared` (Zod), `apps/server` (Fastify + Drizzle/Postgres + Anthropic + OpenAI images), `apps/web` (React + Vite + react-query). Tests: vitest (`pnpm --filter @mysterio/<pkg> test`). Web has no test runner — verify with `pnpm --filter @mysterio/web typecheck` + `pnpm --filter @mysterio/web build`.

## Global Constraints

- **No DB migration.** `mysteries.category` is already `text NOT NULL`; it now stores the free-text `case_type`. Do not add/alter columns. Source: design §Decisions 3.
- **`CATEGORY_IDS` / `CategoryId` stay exported** from `packages/shared/src/constants/categories.ts` as a **legacy display lookup** for the 24 old mysteries. Do not delete that file. Only the `LogicStructure` schema stops using the enum.
- **Solvability machinery is unchanged.** Do not touch `compareSolutions`, `validationAgent`, `readthrough`, redaction *rules* (only the field name changes), or the difficulty/age (Spec 2b) tuning. The only new gate is "≥1 roster resident," enforced via the existing regen-notes loop.
- **Spoiler-safe.** `case_type` is a non-spoiler label (e.g. "sabotaged bake-off") — safe to expose to the validation prose-solver, the narrative agent, and the cover-image prompt. Never pass `true_solution`/culprit data into prompts that don't already receive it.
- **Difficulty + age come from presets**, never from the kid UX. A debug-only optional override is allowed in the request body but must default off.
- **Field name is exactly `case_type`** (snake_case) in the JSON/schema; the TS-facing request field is `case_type_hint`. Source: design §Components.
- Cite `3f:` in commit messages.

---

### Task 1: Shared schema — `category` enum → `case_type` free string

**Files:**
- Modify: `packages/shared/src/schemas/logicStructure.ts`
- Modify: `packages/shared/src/types/logicStructure.ts:21`
- Modify: `packages/shared/src/types/mystery.ts:34`
- Test: `packages/shared/src/schemas/logicStructure.test.ts`

**Interfaces:**
- Produces: `logicStructureSchema` now has `case_type: string (3..60)` instead of `category`. `LogicStructure["case_type"]: string`. `RedactedLogicStructure.case_type: string`. `MysterySummary.category: string` (widened — it mirrors the now-free-text DB column). All later tasks read/write `logic.case_type`.

- [ ] **Step 1: Update the schema test first**

In `packages/shared/src/schemas/logicStructure.test.ts`, find every place that builds a valid fixture with `category: "<one of the 4>"` and change that key to `case_type: "<short label>"` (e.g. `case_type: "missing pet"`). Then add a focused test near the other schema tests:

```ts
it("accepts a free-text case_type and rejects empty/over-long ones", () => {
  const base = makeValidLogicStructure(); // existing helper/fixture in this file
  expect(logicStructureSchema.safeParse({ ...base, case_type: "sabotaged bake-off" }).success).toBe(true);
  expect(logicStructureSchema.safeParse({ ...base, case_type: "ab" }).success).toBe(false); // <3
  expect(logicStructureSchema.safeParse({ ...base, case_type: "x".repeat(61) }).success).toBe(false); // >60
});
```

If this file has no `makeValidLogicStructure` helper, reuse whatever existing valid-fixture object the file already defines (read the file first) and spread `case_type` onto it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/shared test`
Expected: FAIL — schema still has `category`, so `case_type` is rejected / `category` missing.

- [ ] **Step 3: Change the schema**

In `packages/shared/src/schemas/logicStructure.ts`, remove the now-unused imports (lines 2-3) and swap the field (line 37):

```ts
// DELETE these two import lines at the top:
//   import { CATEGORY_IDS } from "../constants/categories.js";
//   import type { CategoryId } from "../constants/categories.js";

// In logicStructureSchema, replace:
//   category: z.enum(CATEGORY_IDS as unknown as [CategoryId, ...CategoryId[]]),
// with:
  case_type: z.string().min(3).max(60),
```

Leave every other field and the entire `.superRefine(...)` block unchanged.

- [ ] **Step 4: Update the derived types**

In `packages/shared/src/types/logicStructure.ts`, change the `RedactedLogicStructure` field (line 21):

```ts
export interface RedactedLogicStructure {
  case_type: LogicStructure["case_type"];
  setting: string;
  characters: Array<Pick<Character, "id" | "name" | "role" | "description">>;
  essential_clues: EssentialClue[];
}
```

In `packages/shared/src/types/mystery.ts`, widen the `MysterySummary.category` field (line 34) — it mirrors the DB `category` column which is now free text. Change:

```ts
  category: string;
```

(The `import type { CategoryId } from "../constants/categories.js";` at line 2 becomes unused — delete that import line.)

- [ ] **Step 5: Verify shared package green**

Run: `pnpm --filter @mysterio/shared test && pnpm --filter @mysterio/shared typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "3f: LogicStructure.category enum -> free-text case_type"
```

---

### Task 2: Server cutover — propagate `case_type`, drop category from the generate contract, read presets

This is the atomic mechanical cutover: rename the parsed/persisted field through every server consumer, remove the fixed-category inputs from the agent/orchestrator/route, read the player's presets, and fix every `LogicStructure` test fixture. **No new behavior** beyond the field/contract change (rich open-ended prompt framing, the resident gate, and anti-repetition come in Tasks 3-5; the web UI in Task 6). End state: full server suite + workspace typecheck + web build all green.

**Files:**
- Modify: `apps/server/src/services/generation/redact.ts:5`
- Modify: `apps/server/src/services/generation/prompts/validation.system.ts:4`
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts` (JSON key only; rich framing is Task 3)
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts`
- Modify: `apps/server/src/services/generation/agents/narrativeAgent.ts:126`
- Modify: `apps/server/src/services/generation/prompts/narrative.system.ts:20`
- Modify: `apps/server/src/services/images/style.ts`
- Modify: `apps/server/src/services/generation/agents/coverImageAgent.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/routes/mysteries.ts`
- Test fixtures (rename `category:` → `case_type:` in **LogicStructure literals only**): `apps/server/src/services/generation/redact.test.ts`, `readthrough.test.ts`, `roster.extractAppearances.test.ts`, `parseAnnotations.test.ts`, `apps/server/src/routes/debugView.test.ts`, `hints.test.ts`, `solutions.test.ts`, `trophies.test.ts`, `apps/server/src/services/images/style.test.ts`, `apps/server/src/services/generation/agents/coverImageAgent.test.ts`, `apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts`, `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`
- Test: `apps/server/src/routes/mysteriesGenerate.test.ts`

**Interfaces:**
- Consumes: `LogicStructure.case_type` (Task 1).
- Produces:
  - `redact(ls)` returns `{ case_type, setting, characters, essential_clues }`.
  - `runLogicStructureAgent` input: `{ difficulty, ageRange, previousFailureNotes?, castPool?, caseTypeHint? }` (no `category`).
  - `buildCoverPrompt(input)` and `runCoverImageAgent` input take `caseType: string` (no `category`).
  - `runGeneration` input (`RunInput`): `{ mysteryId, difficulty, ageRange, generateImage?, caseTypeHint? }` (no `category`).
  - `POST /mysteries/generate` body: `{ player_id: string, difficulty?: "easy"|"medium"|"hard", case_type_hint?: string }`. Difficulty resolves to `body.difficulty ?? player.default_difficulty`. Row is inserted with `category = case_type_hint ?? "mystery"` and `category` is overwritten with `logic.case_type` once the structure locks.

- [ ] **Step 1: Update the generate-route test to the new contract**

Replace the body of `apps/server/src/routes/mysteriesGenerate.test.ts`'s describe block so payloads no longer send `category`/`difficulty` and difficulty comes from the preset. Keep the existing DB-insert tests (they insert `category: "missing-pet"` into the **mysteries table** — that is a free-text column value now, leave those inserts as-is). Update the first test:

```ts
describe("POST /mysteries/generate — presets", () => {
  it("reads the detective's preset difficulty + age band and threads them to generation", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate",
      payload: { player_id: "p-young" }, // no category, no difficulty
    });
    expect(res.statusCode).toBe(202);
    const id = res.json().mystery_id;
    const [row] = await getDb().select().from(mysteries).where(eq(mysteries.id, id)).limit(1);
    expect(row?.target_age_range).toBe("8-9");
    expect(row?.difficulty).toBe("easy"); // from player.default_difficulty
    expect(runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ ageRange: "8-9", difficulty: "easy" }),
    );
  });

  it("honors a debug difficulty override in the body", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate",
      payload: { player_id: "p-young", difficulty: "hard" },
    });
    expect(res.statusCode).toBe(202);
    expect(runGeneration).toHaveBeenCalledWith(expect.objectContaining({ difficulty: "hard" }));
  });

  it("404s for an unknown player", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate", payload: { player_id: "nope" },
    });
    expect(res.statusCode).toBe(404);
  });
```

Keep the two existing `GET /mysteries/:id returns target_age_range...` tests unchanged (their inserts use `category: "missing-pet"` as a plain string column — fine).

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @mysterio/server test src/routes/mysteriesGenerate.test.ts`
Expected: FAIL — route still requires `category`/`difficulty`.

- [ ] **Step 3: Rewrite the generate route**

In `apps/server/src/routes/mysteries.ts`, replace the `generateBody` schema and the handler (lines 13-51):

```ts
const generateBody = z.object({
  player_id: z.string().min(1),
  // Debug-only optional overrides (never sent by the kid UX). Difficulty defaults to the player's preset.
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  case_type_hint: z.string().min(3).max(60).optional(),
});

export async function mysteriesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/mysteries/generate", async (req, reply) => {
    const parsed = generateBody.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: "invalid_body", issues: parsed.error.issues };
    }
    const db = getDb();
    const [player] = await db.select().from(players).where(eq(players.id, parsed.data.player_id)).limit(1);
    if (!player) {
      reply.status(404);
      return { error: "player_not_found" };
    }
    const difficulty = (parsed.data.difficulty ?? player.default_difficulty) as DifficultyId;
    const id = mysteryId();
    await db.insert(mysteries).values({
      id,
      player_id: parsed.data.player_id,
      // Placeholder until the orchestrator copies the invented case_type into this column.
      category: parsed.data.case_type_hint ?? "mystery",
      difficulty,
      target_age_range: player.age_range,
      status: "pending",
    });

    void runGeneration({
      mysteryId: id,
      difficulty,
      ageRange: player.age_range as AgeRange,
      caseTypeHint: parsed.data.case_type_hint,
    });

    reply.status(202);
    return { mystery_id: id, status: "pending" };
  });
```

Add `DifficultyId` to the existing `@mysterio/shared` type import at the top of the file (it already imports `AgeRange`):

```ts
import type { AgeRange, DifficultyId } from "@mysterio/shared";
```

Leave the `GET /mysteries/:id`, `/debug`, `/audio`, and list handlers unchanged (they read `row.category` which now holds free text — that is fine).

- [ ] **Step 4: Update `redact.ts` and the validation prompt**

In `apps/server/src/services/generation/redact.ts`, change line 5 `category: ls.category,` → `case_type: ls.case_type,`.

In `apps/server/src/services/generation/prompts/validation.system.ts`, change the bullet (line 4) from the fixed-category description to:

```
- "case_type": a short free-text label for the kind of case (flavor only — do not rely on it to solve)
```

- [ ] **Step 5: Update `logicStructure.system.ts` JSON key (mechanical only)**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`, change line 17 from the category enum line to:

```ts
  "case_type": "<a short free-text label for this kind of case, 3-60 chars, e.g. 'sabotaged bake-off' or 'missing heirloom'>",
```

Leave the rest of the prompt as-is for now (Task 3 rewrites the scenario framing and removes the category-plausibility rule).

- [ ] **Step 6: Update `logicStructureAgent.ts` — drop the category input**

In `apps/server/src/services/generation/agents/logicStructureAgent.ts`:
- Remove `type CategoryId,` from the `@mysterio/shared` import (lines 1-8).
- Change the input interface (remove `category`, add `caseTypeHint?`):

```ts
export interface LogicStructureAgentInput {
  difficulty: DifficultyId;
  ageRange: AgeRange;
  previousFailureNotes?: string;
  castPool?: CastPool;
  /** Optional debug hint nudging the kind of case to invent. */
  caseTypeHint?: string;
}
```

- Replace `buildUserMessage`'s `base` line (line 85) so it no longer names a category:

```ts
function buildUserMessage(input: LogicStructureAgentInput, lastError?: string): string {
  const hint = input.caseTypeHint ? ` The case should be along these lines: ${input.caseTypeHint}.` : "";
  const base = `Invent a ${input.difficulty} kid-friendly mystery set in Maple Hollow.${hint}${buildCastPoolUserSection(input.castPool)}`;
```

Leave the rest of the function (the `previousFailureNotes` and `lastError` branches) unchanged.

- [ ] **Step 7: Update `narrativeAgent.ts` + narrative tone wording**

In `apps/server/src/services/generation/agents/narrativeAgent.ts`, change line 126 in `redactForNarrative` from `category: ls.category,` → `case_type: ls.case_type,`.

In `apps/server/src/services/generation/prompts/narrative.system.ts`, change line 20 from "Spookiness only if the category warrants it" to:

```
- Tone: warm, observant, gently curious. Spookiness only if the case warrants it; never gory.
```

- [ ] **Step 8: Update cover-image prompt + agent**

In `apps/server/src/services/images/style.ts`:
- Remove `import type { CategoryId } from "@mysterio/shared";` (line 1).
- Change `CoverPromptInput` to take `caseType` instead of `category`:

```ts
export interface CoverPromptInput {
  caseType: string;
  title: string;
  centralQuestion: string;
  setting: string;
}
```

- Delete the `CATEGORY_MOOD` map (lines 22-27) and change the `Scene:` line in `buildCoverPrompt`:

```ts
export function buildCoverPrompt(input: CoverPromptInput): string {
  return [
    STYLE_PREAMBLE,
    `Scene: a cozy kid-friendly detective case — ${input.caseType}.`,
    `Setting: ${input.setting}`,
    `It illustrates the mystery "${input.title}". ${input.centralQuestion}`,
    "Show the place and mood, not the answer — do not reveal who did it.",
    SAFETY_CLAUSE,
  ].join(" ");
}
```

In `apps/server/src/services/generation/agents/coverImageAgent.ts`:
- Remove `import type { CategoryId } from "@mysterio/shared";` (line 1).
- Change `CoverImageAgentInput.category: CategoryId` → `caseType: string`.
- Change the `buildCoverPrompt({ category: input.category, ... })` call (line 25) to `buildCoverPrompt({ caseType: input.caseType, ... })`.

- [ ] **Step 9: Update the orchestrator**

In `apps/server/src/services/generation/orchestrator.ts`:
- Remove `CategoryId` from the `@mysterio/shared` import (line 2).
- Change `RunInput` (lines 15-22) — drop `category`, add `caseTypeHint?`:

```ts
interface RunInput {
  mysteryId: string;
  difficulty: DifficultyId;
  ageRange: AgeRange;
  /** When false, skips cover-image generation. Defaults to true (image generated). Spec-4 parent-toggle hook. */
  generateImage?: boolean;
  /** Optional debug hint nudging the kind of case to invent. */
  caseTypeHint?: string;
}
```

- In the logic-agent call (lines 46-52) remove `category: input.category,` and add `caseTypeHint: input.caseTypeHint,`.
- In the structure-lock update (lines 78-82) add `category: logic.case_type` so the row's display column reflects the invented case type:

```ts
      await db.update(mysteries).set({
        status: "writing",
        logic_structure_json: logic,
        validation_passed: true,
        category: logic.case_type,
      }).where(eq(mysteries.id, input.mysteryId));
```

- In the cover-image call (lines 99-105) replace `category: input.category,` with `caseType: logic.case_type,`.

- [ ] **Step 10: Rename `category` → `case_type` in all LogicStructure test fixtures**

In each file listed under **Files → Test fixtures**, find object literals that build a `LogicStructure` (they contain `true_solution:` / `essential_clues:` / `logic_chain:`) and rename their `category: "<x>"` key to `case_type: "<x>"`. **Do NOT** change `category:` keys in `db.insert(mysteries).values({...})` calls — those write the free-text DB column and stay as-is.

For `coverImageAgent.test.ts` and `style.test.ts`: these pass `category` into `buildCoverPrompt`/`runCoverImageAgent` — change those call sites to `caseType: "<x>"` and update any assertion that expected the old `CATEGORY_MOOD` scene text to instead assert the `case_type` text appears in the prompt (e.g. `expect(prompt).toContain("sabotaged bake-off")`).

For `logicStructure.system.test.ts`: update assertions that check for the category enum line to instead assert the prompt contains `"case_type"` and does **not** contain `"missing-pet"`.

For `logicStructureAgent.castPool.test.ts`: remove `category: "..."` from the agent-input object passed to `runLogicStructureAgent` (the input no longer has that field); if the test asserts the user message contains a category word, update it to assert it contains `"Maple Hollow"`.

Find every candidate with:

```bash
grep -rn 'category:' apps/server/src --include='*.test.ts'
```

For each hit, open the file and decide: LogicStructure literal → rename to `case_type:`; mysteries-table insert → leave.

- [ ] **Step 11: Run the full server suite + workspace typecheck + web build**

Run:
```bash
pnpm --filter @mysterio/server test
pnpm -r typecheck
pnpm --filter @mysterio/web build
```
Expected: all PASS. If a fixture was missed, the suite or typecheck will name the file — fix and re-run.

- [ ] **Step 12: Commit**

```bash
git add apps/server packages
git commit -m "3f: cut generation over from fixed category to free-text case_type; read player presets"
```

---

### Task 3: Open-ended scenario framing in the logic-structure prompt

Replace the per-category scenario instructions with an open-ended "invent any Maple Hollow case involving ≥1 resident, set in a provided place" framing, and remove the category-plausibility rule. This is the product-quality core of 3f and is reviewable independently of the mechanical cutover.

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`
- Test: `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`

**Interfaces:**
- Consumes: `buildLogicStructureSystem(difficulty, ageRange)` (signature unchanged).
- Produces: same function; prompt text now open-ended.

- [ ] **Step 1: Add prompt-content assertions**

In `apps/server/src/services/generation/prompts/logicStructure.system.test.ts`, add:

```ts
it("frames generation as open-ended and Maple-Hollow-bound, with no fixed categories", () => {
  const sys = buildLogicStructureSystem("easy", "10-11");
  expect(sys).toContain("Maple Hollow");
  expect(sys).toContain("case_type");
  // No fixed category menu anymore:
  expect(sys).not.toContain("missing-pet");
  expect(sys).not.toContain("haunted-mansion");
  // No category-plausibility rule anymore:
  expect(sys).not.toContain("plausible for the category");
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/logicStructure.system.test.ts`
Expected: FAIL — the prompt still names `missing-pet` etc. (line 64's plausibility rule).

- [ ] **Step 3: Add the open-ended framing line**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`, after the `AGE BAND:` line (line 13), add an open-ended brief:

```ts
AGE BAND: ${ageRange} — ${b.subtletyNudge}

THE CASE: Invent ANY kid-appropriate mystery you like — a theft, a prank, a sabotage, a mix-up, a missing object, a strange event — there is no fixed list of case types. The ONLY hard requirements: it is set in the town of Maple Hollow, it takes place in ONE of the town places provided in the user message, and it features AT LEAST ONE of the Maple Hollow townsfolk provided in the user message as a suspect, witness, or bystander. Emit a short free-text "case_type" label that captures the flavor (e.g. "sabotaged bake-off", "missing heirloom").
`;
```

(Append it to the same template literal — keep it before the `SCHEMA:` block. Note: the surrounding text is one big template string; insert the lines inside it.)

- [ ] **Step 4: Remove the category-plausibility design rule**

In the same file, delete the design rule that ties the setting to a category (the line beginning `- Setting must be plausible for the category ...`, line 64). The town/place/resident requirements above and the existing `CAST FROM THE TOWN ROSTER` rule (line 63) now cover setting selection.

- [ ] **Step 5: Run the prompt test + full server suite**

Run: `pnpm --filter @mysterio/server test src/services/generation/prompts/logicStructure.system.test.ts && pnpm --filter @mysterio/server test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts apps/server/src/services/generation/prompts/logicStructure.system.test.ts
git commit -m "3f: open-ended scenario framing — invent any Maple Hollow case with >=1 resident"
```

---

### Task 4: Enforce "≥1 roster resident" via the regeneration loop

Add a pure helper that checks whether a generated structure reuses at least one roster character, and wire it into the orchestrator so a miss triggers a regenerate with a corrective note (only when the roster is non-empty; unseeded rosters keep legacy behavior).

**Files:**
- Modify: `apps/server/src/services/generation/roster.ts`
- Create: `apps/server/src/services/generation/roster.usesResident.test.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Create: `apps/server/src/services/generation/orchestrator.residentGate.test.ts`

**Interfaces:**
- Consumes: `CastPool` (existing, from `roster.ts`), `LogicStructure` (Task 1).
- Produces: `usesRosterResident(logic: LogicStructure, pool: CastPool): boolean` — `true` when the pool is empty (nothing to enforce) or when ≥1 non-detective character's id is in the pool.

- [ ] **Step 1: Write the helper unit test**

Create `apps/server/src/services/generation/roster.usesResident.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { usesRosterResident } from "./roster.js";
import type { CastPool } from "./roster.js";

function ls(charIds: { id: string; role: LogicStructure["characters"][number]["role"] }[]): LogicStructure {
  return {
    case_type: "test case",
    setting: "A cozy corner of Maple Hollow on a quiet afternoon.",
    characters: charIds.map((c) => ({
      id: c.id, name: c.id === "you" ? "You" : c.id, role: c.role,
      description: "A described townsperson with at least ten characters.",
      is_culprit: false, motive: null,
    })),
    essential_clues: [], false_clues: [],
    true_solution: { who_did_it: "x", how: "x".repeat(10), why: "x".repeat(10) },
    how_distractors: ["a", "b", "c"], why_distractors: ["a", "b", "c"],
    logic_chain: [], central_question: "x".repeat(10),
  } as unknown as LogicStructure; // partial fixture — we only read characters here
}

const pool = (ids: string[]): CastPool => ({
  characters: ids.map((id) => ({ id, name: id, description: "d", traits: null })),
  places: [],
});

describe("usesRosterResident", () => {
  it("returns true when the pool is empty (nothing to enforce)", () => {
    expect(usesRosterResident(ls([{ id: "you", role: "detective" }]), pool([]))).toBe(true);
  });
  it("returns true when a non-detective character reuses a roster id", () => {
    const logic = ls([{ id: "you", role: "detective" }, { id: "mabel", role: "suspect" }]);
    expect(usesRosterResident(logic, pool(["mabel", "theo"]))).toBe(true);
  });
  it("returns false when no character matches the roster", () => {
    const logic = ls([{ id: "you", role: "detective" }, { id: "stranger", role: "suspect" }]);
    expect(usesRosterResident(logic, pool(["mabel", "theo"]))).toBe(false);
  });
  it("ignores the detective even if its id matches a roster id", () => {
    const logic = ls([{ id: "mabel", role: "detective" }]);
    expect(usesRosterResident(logic, pool(["mabel"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/roster.usesResident.test.ts`
Expected: FAIL — `usesRosterResident` not exported.

- [ ] **Step 3: Add the helper**

In `apps/server/src/services/generation/roster.ts`, add (near the top-level exports; ensure `LogicStructure` is imported — it already is for `extractAppearances`):

```ts
/**
 * True if the generated structure ties into the world: ≥1 non-detective character reuses a
 * roster id from the pool. Returns true when the pool is empty (unseeded → legacy behavior,
 * nothing to enforce). Used as a generation gate (3f).
 */
export function usesRosterResident(logic: LogicStructure, pool: CastPool): boolean {
  if (pool.characters.length === 0) return true;
  const rosterIds = new Set(pool.characters.map((c) => c.id));
  return logic.characters.some((c) => c.role !== "detective" && rosterIds.has(c.id));
}
```

- [ ] **Step 4: Run the helper test — verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/roster.usesResident.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the orchestrator gate test (stubbed agents)**

Create `apps/server/src/services/generation/orchestrator.residentGate.test.ts`. It mocks every external agent so no LLM/image/DB-prose runs, seeds one roster character, and asserts the first (no-resident) structure is rejected and regeneration is requested with a corrective note that the second (with-resident) structure satisfies.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock all generation collaborators. The logic agent returns a no-resident structure
// on attempt 1, then a with-resident structure on attempt 2.
const noResident = makeStructure("stranger");
const withResident = makeStructure("mabel");
const logicAgent = vi.fn()
  .mockResolvedValueOnce({ ok: true, value: noResident, attemptsUsed: 1 })
  .mockResolvedValueOnce({ ok: true, value: withResident, attemptsUsed: 1 });

vi.mock("./agents/logicStructureAgent.js", () => ({ runLogicStructureAgent: logicAgent }));
vi.mock("./agents/validationAgent.js", () => ({
  runValidationAgent: vi.fn().mockResolvedValue({ ok: true, value: { who: "mabel", how: "x", why: "x", confidence: 0.9 } }),
}));
vi.mock("./compareSolutions.js", () => ({
  compareSolutions: vi.fn().mockResolvedValue({ passed: true, notes: "ok", who_match: true, how_match: true, why_match: true }),
}));
vi.mock("./readthrough.js", () => ({
  writeAndVerifyProse: vi.fn().mockResolvedValue({ ok: true, value: { title: "T", narrative_text: "N", annotations: [] } }),
}));
vi.mock("./agents/coverImageAgent.js", () => ({ runCoverImageAgent: vi.fn().mockResolvedValue({ ok: false, error: "skip" }) }));

import { runGeneration } from "./orchestrator.js";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { mysteries, players, characters } from "../../db/schema.js";

function makeStructure(suspectId: string) {
  return {
    case_type: "test case", setting: "Maple Hollow, the Cozy Cafe, one afternoon.",
    characters: [
      { id: "you", name: "You", role: "detective", description: "You are the detective on this case.", is_culprit: false, motive: null },
      { id: suspectId, name: suspectId, role: "suspect", description: "A described suspect of ten+ chars.", is_culprit: true, motive: "they wanted it" },
    ],
    essential_clues: [], false_clues: [],
    true_solution: { who_did_it: suspectId, how: "x".repeat(10), why: "x".repeat(10) },
    how_distractors: ["a", "b", "c"], why_distractors: ["a", "b", "c"],
    logic_chain: [], central_question: "What happened here today.",
  };
}

let env: Record<string, string | undefined>;
beforeEach(() => {
  setupTestDb();
  process.env.MAX_VALIDATION_ATTEMPTS = "3";
  process.env.MAX_NARRATIVE_ATTEMPTS = "2";
  process.env.MAX_READTHROUGH_ATTEMPTS = "2";
});
afterEach(() => vi.clearAllMocks());

describe("orchestrator — ≥1 roster resident gate", () => {
  it("regenerates when the first structure uses no roster resident, then accepts one that does", async () => {
    const db = getDb();
    await db.insert(players).values({ id: "p1", name: "Kid", age_range: "10-11", default_difficulty: "easy" });
    await db.insert(characters).values({ id: "mabel", name: "Mabel", description: "Baker.", traits: null, is_seed: true });
    await db.insert(mysteries).values({ id: "m1", player_id: "p1", category: "mystery", difficulty: "easy", status: "pending", target_age_range: "10-11" });

    await runGeneration({ mysteryId: "m1", difficulty: "easy", ageRange: "10-11", generateImage: false });

    expect(logicAgent).toHaveBeenCalledTimes(2);
    // The second call carries a corrective note about missing townsfolk.
    const secondArgs = logicAgent.mock.calls[1][0];
    expect(secondArgs.previousFailureNotes).toMatch(/Maple Hollow|townsfolk|resident/i);
    const [row] = await db.select().from(mysteries).where(eq(mysteries.id, "m1")).limit(1);
    expect(row?.status).toBe("ready");
    expect(row?.category).toBe("test case"); // case_type copied into the column
  });
});
```

Note: confirm the exact env-loading mechanism in `loadEnv()` and `setupTestDb()` helper path while implementing (read `apps/server/src/test/db.js` and `apps/server/src/config/env.ts`); adapt the env setup if `loadEnv` caches or reads differently. The behavioral assertions (2 logic-agent calls, corrective note, `ready`, `category === "test case"`) are the contract.

- [ ] **Step 6: Run it — verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/orchestrator.residentGate.test.ts`
Expected: FAIL — orchestrator does not yet enforce the gate (only one logic-agent call).

- [ ] **Step 7: Wire the gate into the orchestrator**

In `apps/server/src/services/generation/orchestrator.ts`:
- Add `usesRosterResident` to the existing roster import (line 10):

```ts
import { selectCastPool, extractAppearances, usesRosterResident, type CastPool } from "./roster.js";
```

- Immediately after `const logic: LogicStructure = logicRes.value;` (line 58), before the validation phase, add:

```ts
      // 3f: every case must tie into the world — require ≥1 roster resident (skipped when unseeded).
      if (!usesRosterResident(logic, castPool)) {
        previousFailureNotes =
          "This case did not feature any Maple Hollow townsfolk. You MUST cast at least one suspect, witness, or bystander from the provided town roster — reuse their EXACT id and name.";
        log("no_roster_resident", { attempt });
        continue;
      }
```

- [ ] **Step 8: Run the orchestrator gate test + full suite**

Run: `pnpm --filter @mysterio/server test src/services/generation/orchestrator.residentGate.test.ts && pnpm --filter @mysterio/server test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/services/generation/roster.ts apps/server/src/services/generation/roster.usesResident.test.ts apps/server/src/services/generation/orchestrator.ts apps/server/src/services/generation/orchestrator.residentGate.test.ts
git commit -m "3f: enforce >=1 Maple Hollow resident per case via regenerate-with-notes"
```

---

### Task 5: Anti-repetition — pass the player's recent `case_type`s as an "avoid" hint

The route fetches the player's recent `case_type`s (the `mysteries.category` column) and threads them through the orchestrator → logic agent so the prompt asks the model to avoid repeating them. Design §Open questions recommends this for v1; low cost.

**Files:**
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts`
- Test: `apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts` (add an assertion)
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/routes/mysteries.ts`
- Test: `apps/server/src/routes/mysteriesGenerate.test.ts` (add an assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `LogicStructureAgentInput` gains `avoidCaseTypes?: string[]`; the user message lists them as "avoid these recent case types" when non-empty.
  - `RunInput` gains `avoidCaseTypes?: string[]`; passed straight to the logic agent.
  - The route computes `avoidCaseTypes` from the player's most recent ready mysteries and passes it to `runGeneration`.

- [ ] **Step 1: Add the agent-message test**

In `apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts`, add a test that exercises `buildCastPoolUserSection`/`buildUserMessage`. Since `buildUserMessage` is module-private, assert through the exported helper if available, otherwise add a tiny exported pure builder. Prefer exporting a pure `buildAvoidSection`:

```ts
import { buildAvoidSection } from "./logicStructureAgent.js";

it("lists recent case types to avoid when provided", () => {
  expect(buildAvoidSection(["missing heirloom", "sabotaged bake-off"]))
    .toContain("missing heirloom");
  expect(buildAvoidSection([])).toBe("");
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/logicStructureAgent.castPool.test.ts`
Expected: FAIL — `buildAvoidSection` not exported.

- [ ] **Step 3: Implement the avoid section in the agent**

In `apps/server/src/services/generation/agents/logicStructureAgent.ts`:
- Add `avoidCaseTypes?: string[]` to `LogicStructureAgentInput`.
- Add the exported helper:

```ts
export function buildAvoidSection(avoid?: string[]): string {
  if (!avoid || avoid.length === 0) return "";
  return `\n\nThis detective has recently played these case types — invent something DIFFERENT and avoid repeating them:\n${avoid.map((t) => `- ${t}`).join("\n")}`;
}
```

- Append it in `buildUserMessage`'s `base`:

```ts
  const base = `Invent a ${input.difficulty} kid-friendly mystery set in Maple Hollow.${hint}${buildCastPoolUserSection(input.castPool)}${buildAvoidSection(input.avoidCaseTypes)}`;
```

- [ ] **Step 4: Thread it through the orchestrator**

In `apps/server/src/services/generation/orchestrator.ts`:
- Add `avoidCaseTypes?: string[];` to `RunInput`.
- In the logic-agent call, add `avoidCaseTypes: input.avoidCaseTypes,`.

- [ ] **Step 5: Compute recent case types in the route + assert in its test**

In `apps/server/src/routes/mysteries.ts`, before the `runGeneration(...)` call, query the player's recent ready case types and pass them:

```ts
    const recent = await db
      .select({ category: mysteries.category })
      .from(mysteries)
      .where(and(eq(mysteries.player_id, parsed.data.player_id), eq(mysteries.status, "ready")))
      .orderBy(desc(mysteries.created_at))
      .limit(5);
    const avoidCaseTypes = recent.map((r) => r.category).filter((c): c is string => !!c);

    void runGeneration({
      mysteryId: id,
      difficulty,
      ageRange: player.age_range as AgeRange,
      caseTypeHint: parsed.data.case_type_hint,
      avoidCaseTypes,
    });
```

`and`, `desc`, `eq` are already imported at the top of `mysteries.ts`.

In `apps/server/src/routes/mysteriesGenerate.test.ts`, add:

```ts
it("passes the player's recent ready case types as an avoid list", async () => {
  await getDb().insert(mysteries).values({
    id: "old1", player_id: "p-young", category: "missing heirloom",
    difficulty: "easy", status: "ready", target_age_range: "8-9",
  });
  await app.inject({ method: "POST", url: "/mysteries/generate", payload: { player_id: "p-young" } });
  expect(runGeneration).toHaveBeenCalledWith(
    expect.objectContaining({ avoidCaseTypes: expect.arrayContaining(["missing heirloom"]) }),
  );
});
```

- [ ] **Step 6: Run the affected tests + full suite + typecheck**

Run:
```bash
pnpm --filter @mysterio/server test src/services/generation/agents/logicStructureAgent.castPool.test.ts src/routes/mysteriesGenerate.test.ts
pnpm --filter @mysterio/server test
pnpm -r typecheck
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "3f: pass recent case_types as an anti-repetition avoid hint"
```

---

### Task 6: Web — one-tap "Start a new case" button

Collapse the home screen's category grid + difficulty picker to a single button, change the api client to `generate({ player_id })`, and delete the now-unused pickers.

**Files:**
- Modify: `apps/web/src/api/mysteries.ts`
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx`
- Delete: `apps/web/src/screens/MainScreen/CategoryGrid.tsx`
- Delete: `apps/web/src/screens/MainScreen/DifficultyPicker.tsx`

**Interfaces:**
- Consumes: `POST /mysteries/generate { player_id }` (Task 2).
- Produces: `generateMystery({ player_id })`; `MysteryDetail.category: string`.

- [ ] **Step 1: Update the api client**

In `apps/web/src/api/mysteries.ts`:
- Change `MysteryDetail.category` (line 6) type from `CategoryId` to `string`.
- Replace `generateMystery` (lines 30-39):

```ts
export function generateMystery(input: {
  player_id: string;
}): Promise<{ mystery_id: string; status: MysteryStatus }> {
  return api("/api/mysteries/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

- Remove now-unused `CategoryId` / `DifficultyId` from the top-of-file type import if they are no longer referenced anywhere else in the file (check first — `MysteryDetail.difficulty` still uses `DifficultyId`, so keep that one; drop only `CategoryId`).

- [ ] **Step 2: Simplify MainScreen**

In `apps/web/src/screens/MainScreen/MainScreen.tsx`:
- Remove the imports of `CategoryGrid` and `DifficultyPicker` (lines 9-10) and the now-unused `CategoryId` / `difficultyConfig` / `useState` imports as appropriate (keep `useQuery`, `useMutation`, `useQueryClient`).
- Delete the `category`/`difficulty` `useState` lines (27-28).
- Change the mutation (lines 30-36):

```ts
  const generate = useMutation({
    mutationFn: () => generateMystery({ player_id: playerId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mysteries", playerId] });
      navigate(`/mysteries/${res.mystery_id}`);
    },
  });
```

- Replace the two `<section>`s holding `CategoryGrid` and `DifficultyPicker` (lines 114-125) and the existing `<Button>` (lines 127-134) with a single intro + button:

```tsx
      <section style={{ marginBottom: 24 }}>
        <Kicker>New case</Kicker>
        <p style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 8, marginBottom: 16 }}>
          Tap below and the Maple Hollow case desk will write you a fresh mystery to crack.
        </p>
        <Button
          size="lg"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
          style={{ width: "100%" }}
        >
          {generate.isPending ? "Writing up your case…" : "🔍 Start a new case"}
        </Button>
      </section>
```

Leave the reputation card and the `RecentList` section unchanged.

- [ ] **Step 3: Delete the unused pickers**

```bash
git rm apps/web/src/screens/MainScreen/CategoryGrid.tsx apps/web/src/screens/MainScreen/DifficultyPicker.tsx
```

(`SceneArt`'s `SCENE_FOR_CATEGORY[data.category] ?? "generic"` already falls back gracefully for free-text `case_type`s, and legacy cases keep their scene — no change needed there.)

- [ ] **Step 4: Verify web typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS. Fix any dangling import the compiler flags.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "3f: collapse home to a single 'Start a new case' button"
```

---

### Task 7: Full-workspace verification + deploy prep

**Files:** none (verification only).

- [ ] **Step 1: Run everything green**

Run:
```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @mysterio/web build
```
Expected: all PASS.

- [ ] **Step 2: Sanity grep — no stray fixed-category coupling in generation**

Run:
```bash
grep -rn 'CategoryId\|CATEGORY_MOOD\|category: ls\.\|\.category!' apps/server/src apps/web/src | grep -v '\.test\.ts'
```
Expected: no hits in generation/cover paths. `CATEGORY_IDS`/`CategoryId` may still legitimately appear only in `packages/shared/src/constants/categories.ts` (legacy display lookup) and `apps/web` SceneArt legacy mapping — confirm any remaining hit is a legacy-display use, not a live generation coupling.

- [ ] **Step 3: Update CONTINUE.md**

Replace `CONTINUE.md` so it reflects 3d-merged + 3f-built and names 3e as next (program order 3f → 3e). Keep the "first read memories" pointer list.

- [ ] **Step 4: Commit**

```bash
git add CONTINUE.md
git commit -m "3f: update CONTINUE handoff (3f built; 3e next)"
```

- [ ] **Step 5: Hand back for the paid live smoke + iPad pass**

Surface to the user (do not run paid LLM/image smokes unprompted): deploy the branch to exe.dev (`scripts/deploy.sh`), then on `https://panther-golem.exe.xyz/` tap **Start a new case** once and confirm acceptance criteria 1-3 (preset-tuned, town-set, ≥1 resident, coherent `case_type` in title + cover, no category/difficulty pickers). Legacy 24 still render (criterion 4).

---

## Acceptance criteria → task map

| Criterion (design §Acceptance) | Task |
|---|---|
| 1. `POST /generate { player_id }` uses preset difficulty + age | Task 2 (+ Task 5 avoid list) |
| 2. Case set in a roster place, ≥1 resident enforced, coherent free-text `case_type` in title + cover | Tasks 2, 3, 4 |
| 3. Category grid + difficulty picker gone; one button drives the flow | Task 6 |
| 4. Solvability gate unchanged; legacy 24 display correctly | Tasks 2 (no machinery change), 6 (SceneArt fallback) |
| 5. Server suite + web typecheck/build green; deployed for iPad pass | Task 7 |
