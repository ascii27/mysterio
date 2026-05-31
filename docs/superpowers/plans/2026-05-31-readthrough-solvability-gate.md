# Readthrough Solvability Gate + On-Demand Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prose-level "readthrough" gate that verifies every generated mystery is solvable *and* continuous as a kid actually reads it, make audio narration opt-in/on-demand, and left-align the solve-flow clue/hint section.

**Architecture:** A new generation phase runs after the prose is written: a **prose-solver** agent must deduce who/how/why from the story + suspect list alone (graded by the existing `compareSolutions`), and a **continuity auditor** flags any element the reveal depends on that the prose never established (the "What latch" bug). These live inside a restructured orchestrator loop that regenerates prose on failure, then escalates to a fresh logic structure. Separately, TTS leaves the auto-pipeline and becomes an on-demand endpoint gated by a new Settings toggle.

**Tech Stack:** TypeScript monorepo (pnpm). Server: Fastify + Drizzle (SQLite) + Anthropic SDK + Vitest. Web: React + Vite + Zustand + TanStack Query. Shared: Zod.

**Spec:** `docs/superpowers/specs/2026-05-31-readthrough-solvability-gate-design.md`

---

## File Structure

**Server — new:**
- `apps/server/src/services/generation/prompts/proseSolver.system.ts` — system prompt for the prose-solver
- `apps/server/src/services/generation/agents/proseSolverAgent.ts` — solver agent (reuses `validationGuessSchema`)
- `apps/server/src/services/generation/agents/proseSolverAgent.test.ts`
- `apps/server/src/services/generation/prompts/continuityAudit.system.ts` — system prompt for the auditor
- `apps/server/src/services/generation/agents/continuityAuditAgent.ts` — auditor agent + `continuityAuditSchema`
- `apps/server/src/services/generation/agents/continuityAuditAgent.test.ts`
- `apps/server/src/services/generation/readthrough.ts` — `runReadthroughGate` (composes solver + auditor + compare) and `writeAndVerifyProse` (prose-regen loop)
- `apps/server/src/services/generation/readthrough.test.ts`

**Server — modified:**
- `apps/server/src/config/env.ts` — add `MAX_READTHROUGH_ATTEMPTS`
- `apps/server/src/services/generation/agents/narrativeAgent.ts` — accept `extraNotes`
- `apps/server/src/services/generation/orchestrator.ts` — restructured loop, TTS phase removed
- `apps/server/src/routes/mysteries.ts` — add `POST /mysteries/:id/audio`

**Web — modified:**
- `apps/web/src/state/settingsStore.ts` — add `audioEnabled`
- `apps/web/src/screens/SettingsScreen/SettingsScreen.tsx` — audio toggle row
- `apps/web/src/api/mysteries.ts` — `generateAudio()`
- `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx` — audio UI matrix + new `AudioSection`
- the solve-flow clue/hint container — left-align fix (selector confirmed on live render in Task 11)

---

## Conventions for every task

- Server tests: `pnpm --filter @mysterio/server test <path>`
- Shared build (if shared changed): `pnpm --filter @mysterio/shared build`
- Web gate (no test runner in `apps/web`): `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
- Import extensions are `.js` even for `.ts` files (NodeNext). Match the surrounding files.
- Commit after each task.

---

### Task 1: Prose-solver agent

Reads the **story + suspect roster + case question** and must deduce who/how/why — no clue list, no answer. Reuses `validationGuessSchema` so the output drops straight into `compareSolutions`.

**Files:**
- Create: `apps/server/src/services/generation/prompts/proseSolver.system.ts`
- Create: `apps/server/src/services/generation/agents/proseSolverAgent.ts`
- Test: `apps/server/src/services/generation/agents/proseSolverAgent.test.ts`

- [ ] **Step 1: Write the system prompt**

Create `apps/server/src/services/generation/prompts/proseSolver.system.ts`:

```ts
export const PROSE_SOLVER_SYSTEM = `You are a sharp 12-year-old detective reading a mystery story for the first time.

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
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/services/generation/agents/proseSolverAgent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runProseSolverAgent } from "./proseSolverAgent.js";

const characters = [
  { id: "maya", name: "Maya", role: "suspect", description: "The new kid next door." },
  { id: "theo", name: "Theo", role: "suspect", description: "Owns the rabbit." },
  { id: "officer-pat", name: "Officer Pat", role: "detective", description: "Neighborhood helper." },
];

const baseInput = {
  centralQuestion: "Who took the rabbit and why?",
  narrativeText: "Once upon a time...",
  characters,
};

function fakeCall(json: string) {
  return async () => json;
}

describe("runProseSolverAgent", () => {
  it("returns the parsed guess when the model answers with a valid character id", async () => {
    const res = await runProseSolverAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        guess: { who: "maya", how: "She coaxed it out with a carrot.", why: "She wanted to nurse it back to health." },
        reasoning: "The carrot and the open hutch point to Maya.",
        confidence: 0.8,
      })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.guess.who).toBe("maya");
  });

  it("fails (after retries) when the model returns an id not in the roster", async () => {
    const res = await runProseSolverAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        guess: { who: "ghost", how: "Magic.", why: "Mischief." },
        reasoning: "A spooky vibe.",
        confidence: 0.9,
      })),
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/proseSolverAgent.test.ts`
Expected: FAIL — `Cannot find module './proseSolverAgent.js'`.

- [ ] **Step 4: Write the agent**

Create `apps/server/src/services/generation/agents/proseSolverAgent.ts`:

```ts
import { claudeText, extractJson } from "../../anthropic/client.js";
import { PROSE_SOLVER_SYSTEM } from "../prompts/proseSolver.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { formatZodIssues } from "../zodFormat.js";
import { validationGuessSchema } from "./validationAgent.js";
import type { ValidationAgentResult } from "./validationAgent.js";

type ClaudeCall = typeof claudeText;

export interface ProseSolverInput {
  centralQuestion: string;
  narrativeText: string;
  characters: Array<{ id: string; name: string; role: string; description: string }>;
}

const MAX_INTERNAL_ATTEMPTS = 2;

export async function runProseSolverAgent(
  input: ProseSolverInput,
  deps: { call?: ClaudeCall } = {},
): Promise<ValidationAgentResult> {
  const call = deps.call ?? claudeText;
  const validIds = new Set(input.characters.map((c) => c.id));
  let lastError = "";

  const user = [
    "THE CASE:",
    input.centralQuestion,
    "",
    "THE SUSPECTS:",
    JSON.stringify(input.characters, null, 2),
    "",
    "THE STORY:",
    input.narrativeText,
  ].join("\n");

  for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
    const raw = await call({
      label: `proseSolverAgent:attempt${attempt}`,
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: PROSE_SOLVER_SYSTEM, cache: true },
      ],
      user: lastError ? `${user}\n\nYour previous attempt was malformed: ${lastError}` : user,
      maxTokens: 1024,
      temperature: 0.3,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastError = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = validationGuessSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `Zod failed: ${formatZodIssues(result.error)}`;
      continue;
    }
    if (!validIds.has(result.data.guess.who)) {
      lastError = `guess.who '${result.data.guess.who}' is not a valid character id. Valid ids: ${[...validIds].join(", ")}`;
      continue;
    }
    return { ok: true, value: result.data };
  }
  return { ok: false, error: lastError || "prose solver failed without an error message" };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/proseSolverAgent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/prompts/proseSolver.system.ts apps/server/src/services/generation/agents/proseSolverAgent.ts apps/server/src/services/generation/agents/proseSolverAgent.test.ts
git commit -m "feat: prose-solver agent — deduce who/how/why from story + roster alone"
```

---

### Task 2: Continuity auditor agent

Given the story + case question + the **true solution**, lists concrete elements the reveal depends on that the prose never established.

**Files:**
- Create: `apps/server/src/services/generation/prompts/continuityAudit.system.ts`
- Create: `apps/server/src/services/generation/agents/continuityAuditAgent.ts`
- Test: `apps/server/src/services/generation/agents/continuityAuditAgent.test.ts`

- [ ] **Step 1: Write the system prompt**

Create `apps/server/src/services/generation/prompts/continuityAudit.system.ts`:

```ts
export const CONTINUITY_AUDIT_SYSTEM = `You are a story-continuity checker for a children's mystery game.

You will be given:
- THE CASE: the question posed to the reader.
- THE SOLUTION: the true answer (who did it, how, and why).
- THE STORY: the narration the child reads.

The story must be FAIR: every concrete thing the case question or the solution depends on — an object, a place, a mechanism, an action (for example "the latch", "the side gate", "the muddy boots", "the spare key") — must actually appear or be set up somewhere in the story. A child should never reach the answer and think "wait, what latch? that was never mentioned."

Find every concrete element named in THE CASE or THE SOLUTION that is NEVER established anywhere in THE STORY. Ignore the culprit's name itself and generic words; focus on concrete nouns and mechanisms the reasoning hinges on.

Respond with ONLY this JSON, no prose around it:
{
  "dangling": [
    { "element": "<the thing>", "where": "central_question" | "solution", "note": "<why it's missing>" }
  ]
}

If the story sets everything up, return { "dangling": [] }.`;
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/services/generation/agents/continuityAuditAgent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runContinuityAuditAgent } from "./continuityAuditAgent.js";

const baseInput = {
  centralQuestion: "Who got past the latched gate to take the rabbit?",
  narrativeText: "Maya walked up the path. The rabbit was gone.",
  trueSolution: { who_did_it: "maya", how: "She lifted the latch on the gate.", why: "She wanted to help it." },
};

function fakeCall(json: string) {
  return async () => json;
}

describe("runContinuityAuditAgent", () => {
  it("reports a dangling element the story never establishes", async () => {
    const res = await runContinuityAuditAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        dangling: [{ element: "the latch", where: "solution", note: "The story never mentions a latch." }],
      })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dangling).toHaveLength(1);
  });

  it("returns an empty list when everything is established", async () => {
    const res = await runContinuityAuditAgent(baseInput, {
      call: fakeCall(JSON.stringify({ dangling: [] })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dangling).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/continuityAuditAgent.test.ts`
Expected: FAIL — `Cannot find module './continuityAuditAgent.js'`.

- [ ] **Step 4: Write the agent**

Create `apps/server/src/services/generation/agents/continuityAuditAgent.ts`:

```ts
import type { TrueSolution } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { CONTINUITY_AUDIT_SYSTEM } from "../prompts/continuityAudit.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { formatZodIssues } from "../zodFormat.js";

type ClaudeCall = typeof claudeText;

export const danglingRefSchema = z.object({
  element: z.string().min(1),
  where: z.enum(["central_question", "solution"]),
  note: z.string().min(1),
});

export const continuityAuditSchema = z.object({
  dangling: z.array(danglingRefSchema),
});

export type DanglingRef = z.infer<typeof danglingRefSchema>;

export interface ContinuityAuditInput {
  centralQuestion: string;
  narrativeText: string;
  trueSolution: TrueSolution;
}

export type ContinuityAuditResult =
  | { ok: true; dangling: DanglingRef[] }
  | { ok: false; error: string };

const MAX_INTERNAL_ATTEMPTS = 2;

export async function runContinuityAuditAgent(
  input: ContinuityAuditInput,
  deps: { call?: ClaudeCall } = {},
): Promise<ContinuityAuditResult> {
  const call = deps.call ?? claudeText;
  let lastError = "";

  const user = [
    "THE CASE:",
    input.centralQuestion,
    "",
    "THE SOLUTION:",
    JSON.stringify(input.trueSolution, null, 2),
    "",
    "THE STORY:",
    input.narrativeText,
  ].join("\n");

  for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
    const raw = await call({
      label: `continuityAuditAgent:attempt${attempt}`,
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: CONTINUITY_AUDIT_SYSTEM, cache: true },
      ],
      user: lastError ? `${user}\n\nYour previous attempt was malformed: ${lastError}` : user,
      maxTokens: 1024,
      temperature: 0.1,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastError = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = continuityAuditSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `Zod failed: ${formatZodIssues(result.error)}`;
      continue;
    }
    return { ok: true, dangling: result.data.dangling };
  }
  return { ok: false, error: lastError || "continuity auditor failed without an error message" };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/continuityAuditAgent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/prompts/continuityAudit.system.ts apps/server/src/services/generation/agents/continuityAuditAgent.ts apps/server/src/services/generation/agents/continuityAuditAgent.test.ts
git commit -m "feat: continuity auditor — flag reveal elements the prose never set up"
```

---

### Task 3: Readthrough gate composition (`runReadthroughGate`)

Composes the two agents + `compareSolutions` into a single pass/fail verdict for one prose draft. Solver malfunction → fail (regen); auditor malfunction → fail-open (log, don't block), since the solver is the primary solvability gate.

**Files:**
- Create: `apps/server/src/services/generation/readthrough.ts`
- Test: `apps/server/src/services/generation/readthrough.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/readthrough.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { runReadthroughGate } from "./readthrough.js";

const logic = {
  category: "missing-pet",
  setting: "A quiet cul-de-sac with rabbit hutches.",
  characters: [
    { id: "maya", name: "Maya", role: "suspect", description: "The new kid next door who loves animals.", is_culprit: true, motive: "wanted to help the sick rabbit" },
    { id: "theo", name: "Theo", role: "suspect", description: "Owns the rabbit.", is_culprit: false, motive: null },
    { id: "officer-pat", name: "Officer Pat", role: "detective", description: "Neighborhood helper.", is_culprit: false, motive: null },
  ],
  essential_clues: [
    { id: "carrot", description: "A half-eaten carrot near the hutch.", category_type: "item" },
    { id: "open-latch", description: "The hutch latch was flipped up.", category_type: "item" },
    { id: "maya-note", description: "Maya left a worried note about the rabbit sneezing.", category_type: "note" },
  ],
  false_clues: [{ id: "wrapper", description: "A candy wrapper on the lawn." }],
  true_solution: { who_did_it: "maya", how: "She flipped the latch and carried the rabbit home.", why: "She wanted to nurse the sneezing rabbit back to health." },
  how_distractors: ["It squeezed out a gap", "A fox carried it off", "The gate blew open"],
  why_distractors: ["To sell it", "For a prank", "Out of spite"],
  logic_chain: ["The latch was flipped from outside.", "Maya's note shows she worried about it.", "The carrot lured it to her."],
  central_question: "Who flipped the hutch latch to take the sneezing rabbit, and why?",
} as unknown as LogicStructure;

const okGuess = {
  guess: { who: "maya", how: "She opened the latch and took it home.", why: "To care for the sick rabbit." },
  reasoning: "latch + note + carrot",
  confidence: 0.85,
};

describe("runReadthroughGate", () => {
  it("passes when the prose-solver solves it and the auditor finds no dangling refs", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "..." },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(r.passed).toBe(true);
  });

  it("fails with notes when the auditor finds a dangling element", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "..." },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [{ element: "the latch", where: "solution", note: "never mentioned" }] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(r.passed).toBe(false);
    expect(r.notes).toContain("the latch");
  });

  it("fails when the prose-solver cannot solve it from the story", async () => {
    const r = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "..." },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: false, who_match: false, how_match: false, why_match: false, confidence_floor_violated: false, notes: "guessed the wrong person" }),
      },
    );
    expect(r.passed).toBe(false);
    expect(r.notes).toContain("wrong person");
  });

  it("fail-closed when the solver malfunctions, but ignores an auditor malfunction", async () => {
    const solverDown = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "..." },
      {
        solver: async () => ({ ok: false, error: "model down" }),
        auditor: async () => ({ ok: true, dangling: [] }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(solverDown.passed).toBe(false);

    const auditorDown = await runReadthroughGate(
      { logicStructure: logic, narrativeText: "..." },
      {
        solver: async () => ({ ok: true, value: okGuess }),
        auditor: async () => ({ ok: false, error: "model down" }),
        compare: async () => ({ passed: true, who_match: true, how_match: true, why_match: true, confidence_floor_violated: false, notes: "ok" }),
      },
    );
    expect(auditorDown.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/readthrough.test.ts`
Expected: FAIL — `Cannot find module './readthrough.js'`.

- [ ] **Step 3: Write `runReadthroughGate`**

Create `apps/server/src/services/generation/readthrough.ts`:

```ts
import type { LogicStructure } from "@mysterio/shared";
import { logger } from "../../utils/logger.js";
import { runContinuityAuditAgent } from "./agents/continuityAuditAgent.js";
import type { ContinuityAuditResult } from "./agents/continuityAuditAgent.js";
import { runProseSolverAgent } from "./agents/proseSolverAgent.js";
import type { ValidationAgentResult } from "./agents/validationAgent.js";
import { compareSolutions } from "./compareSolutions.js";
import type { CompareResult } from "./compareSolutions.js";

export interface ReadthroughInput {
  logicStructure: LogicStructure;
  narrativeText: string;
}

export interface ReadthroughVerdict {
  passed: boolean;
  notes: string;
}

export interface ReadthroughDeps {
  solver?: (input: Parameters<typeof runProseSolverAgent>[0]) => Promise<ValidationAgentResult>;
  auditor?: (input: Parameters<typeof runContinuityAuditAgent>[0]) => Promise<ContinuityAuditResult>;
  compare?: (...args: Parameters<typeof compareSolutions>) => Promise<CompareResult>;
}

export async function runReadthroughGate(
  input: ReadthroughInput,
  deps: ReadthroughDeps = {},
): Promise<ReadthroughVerdict> {
  const solver = deps.solver ?? runProseSolverAgent;
  const auditor = deps.auditor ?? runContinuityAuditAgent;
  const compare = deps.compare ?? compareSolutions;

  const ls = input.logicStructure;
  const characters = ls.characters.map((c) => ({
    id: c.id, name: c.name, role: c.role, description: c.description,
  }));

  // --- Solvability (primary gate): solve from the prose alone, then grade. ---
  const solved = await solver({
    centralQuestion: ls.central_question,
    narrativeText: input.narrativeText,
    characters,
  });
  if (!solved.ok) {
    return { passed: false, notes: `A fresh reader could not produce a usable answer from the story (solver error: ${solved.error}).` };
  }
  const cmp = await compare(solved.value, ls.true_solution);

  // --- Continuity (secondary gate): fail-open on auditor malfunction. ---
  const audit = await auditor({
    centralQuestion: ls.central_question,
    narrativeText: input.narrativeText,
    trueSolution: ls.true_solution,
  });
  let dangling: string[] = [];
  if (audit.ok) {
    dangling = audit.dangling.map((d) => `${d.element} (${d.where}): ${d.note}`);
  } else {
    logger.info("continuity_auditor_malfunction", { error: audit.error });
  }

  const passed = cmp.passed && dangling.length === 0;
  if (passed) return { passed: true, notes: "readthrough passed" };

  const parts: string[] = [];
  if (!cmp.passed) {
    parts.push(`A fresh reader could not solve the story as written: ${cmp.notes} (their reasoning: ${solved.value.reasoning}).`);
  }
  if (dangling.length > 0) {
    parts.push(`The story never establishes things the answer depends on — set these up earlier in the prose: ${dangling.join("; ")}.`);
  }
  return { passed: false, notes: parts.join(" ") };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/readthrough.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/readthrough.ts apps/server/src/services/generation/readthrough.test.ts
git commit -m "feat: runReadthroughGate — compose prose-solver + auditor into one verdict"
```

---

### Task 4: Narrative agent accepts readthrough feedback (`extraNotes`)

The prose-regen loop needs to tell the writer *why* the last draft failed the gate.

**Files:**
- Modify: `apps/server/src/services/generation/agents/narrativeAgent.ts`

- [ ] **Step 1: Add `extraNotes` to the input interface**

In `narrativeAgent.ts`, modify `NarrativeAgentInput`:

```ts
export interface NarrativeAgentInput {
  logicStructure: LogicStructure;
  difficulty: DifficultyId;
  maxAttempts: number;
  extraNotes?: string;
}
```

- [ ] **Step 2: Thread it into the user message**

In `runNarrativeAgent`, change the `buildUserMessage` call (currently `buildUserMessage(safeForNarrative, missingByAttempt[missingByAttempt.length - 1])`) to pass `input.extraNotes`:

```ts
const userMsg = buildUserMessage(
  safeForNarrative,
  missingByAttempt[missingByAttempt.length - 1],
  input.extraNotes,
);
```

And update `buildUserMessage` to append the notes:

```ts
function buildUserMessage(
  safe: ReturnType<typeof redactForNarrative>,
  missingPrev?: string[],
  extraNotes?: string,
): string {
  const baseLines = [
    "Write the narration for this mystery. Output JSON as instructed.",
    "",
    JSON.stringify(safe, null, 2),
  ];
  if (missingPrev && missingPrev.length > 0) {
    const list = safe.essential_clues
      .filter((c) => missingPrev.includes(c.id))
      .map((c) => `- ${c.id}: ${c.description}`)
      .join("\n");
    baseLines.push("", "MISSING CLUES from your previous attempt — make sure these appear naturally in the new draft:", list);
  }
  if (extraNotes) {
    baseLines.push("", "A TEST READER FOUND PROBLEMS with the previous version — fix these in the new draft:", extraNotes);
  }
  return baseLines.join("\n");
}
```

- [ ] **Step 3: Verify the full server suite still compiles & passes**

Run: `pnpm --filter @mysterio/server test`
Expected: PASS (all existing tests green; the new param is optional so nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/generation/agents/narrativeAgent.ts
git commit -m "feat: narrative agent accepts extraNotes for readthrough feedback"
```

---

### Task 5: Orchestrator restructuring + remove TTS phase

Move narrative + readthrough inside the outer loop; regen prose then escalate; drop auto-TTS. The prose-regen loop is extracted as a **pure, injectable** `writeAndVerifyProse` so the new control flow is unit-tested without a DB.

**Files:**
- Modify: `apps/server/src/config/env.ts`
- Modify: `apps/server/src/services/generation/readthrough.ts` (add `writeAndVerifyProse`)
- Create: append to `apps/server/src/services/generation/readthrough.test.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`

- [ ] **Step 1: Add the env constant**

In `apps/server/src/config/env.ts`, add to `envSchema` (after `MAX_NARRATIVE_ATTEMPTS`):

```ts
  MAX_READTHROUGH_ATTEMPTS: z.coerce.number().int().positive().default(2),
```

- [ ] **Step 2: Write the failing test for `writeAndVerifyProse`**

Append to `apps/server/src/services/generation/readthrough.test.ts`:

```ts
import { writeAndVerifyProse } from "./readthrough.js";

const narrativeOk = {
  ok: true as const,
  value: { title: "The Case", narrative_text: "...", annotations: [] },
  attemptsUsed: 1,
  missingCluesByAttempt: [],
};

describe("writeAndVerifyProse", () => {
  it("returns ok on the first draft when the gate passes", async () => {
    let calls = 0;
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async () => { calls++; return narrativeOk; },
        gate: async () => ({ passed: true, notes: "ok" }),
      },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("retries prose with the gate notes, then succeeds", async () => {
    let calls = 0;
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async () => { calls++; return narrativeOk; },
        gate: async () => (calls < 2 ? { passed: false, notes: "the latch is missing" } : { passed: true, notes: "ok" }),
      },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("escalates after readthrough attempts are exhausted", async () => {
    const r = await writeAndVerifyProse(
      { logicStructure: logic, difficulty: "easy", maxNarrativeAttempts: 2, maxReadthroughAttempts: 2 },
      {
        narrative: async () => narrativeOk,
        gate: async () => ({ passed: false, notes: "still unsolvable" }),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.escalationNotes).toContain("still unsolvable");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/readthrough.test.ts`
Expected: FAIL — `writeAndVerifyProse` is not exported.

- [ ] **Step 4: Implement `writeAndVerifyProse`**

Append to `apps/server/src/services/generation/readthrough.ts`:

```ts
import type { DifficultyId } from "@mysterio/shared";
import { runNarrativeAgent } from "./agents/narrativeAgent.js";
import type { NarrativeAgentResult, NarrativeOutput } from "./agents/narrativeAgent.js";

export interface WriteAndVerifyInput {
  logicStructure: LogicStructure;
  difficulty: DifficultyId;
  maxNarrativeAttempts: number;
  maxReadthroughAttempts: number;
}

export interface WriteAndVerifyDeps {
  narrative?: (extraNotes?: string) => Promise<NarrativeAgentResult>;
  gate?: (narrativeText: string) => Promise<ReadthroughVerdict>;
}

export type WriteAndVerifyResult =
  | { ok: true; value: NarrativeOutput }
  | { ok: false; escalationNotes: string };

export async function writeAndVerifyProse(
  input: WriteAndVerifyInput,
  deps: WriteAndVerifyDeps = {},
): Promise<WriteAndVerifyResult> {
  const narrative =
    deps.narrative ??
    ((extraNotes?: string) =>
      runNarrativeAgent({
        logicStructure: input.logicStructure,
        difficulty: input.difficulty,
        maxAttempts: input.maxNarrativeAttempts,
        extraNotes,
      }));
  const gate =
    deps.gate ??
    ((narrativeText: string) =>
      runReadthroughGate({ logicStructure: input.logicStructure, narrativeText }));

  let notes: string | undefined;
  for (let attempt = 1; attempt <= input.maxReadthroughAttempts; attempt++) {
    const draft = await narrative(notes);
    if (!draft.ok) {
      notes = `The writer could not include all essential clues: ${draft.error}`;
      continue;
    }
    const verdict = await gate(draft.value.narrative_text);
    if (verdict.passed) return { ok: true, value: draft.value };
    notes = verdict.notes;
  }
  return {
    ok: false,
    escalationNotes: `The prose could not be made solvable after ${input.maxReadthroughAttempts} attempts. Last problem: ${notes ?? "unknown"}`,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/readthrough.test.ts`
Expected: PASS (4 gate tests + 3 writeAndVerifyProse tests).

- [ ] **Step 6: Rewrite the orchestrator**

Replace the body of `apps/server/src/services/generation/orchestrator.ts` with:

```ts
import { eq } from "drizzle-orm";
import type { CategoryId, DifficultyId, LogicStructure } from "@mysterio/shared";
import { loadEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { runLogicStructureAgent } from "./agents/logicStructureAgent.js";
import { runValidationAgent } from "./agents/validationAgent.js";
import { compareSolutions } from "./compareSolutions.js";
import { redact } from "./redact.js";
import { writeAndVerifyProse } from "./readthrough.js";

interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
  playerName: string;
}

export async function runGeneration(input: RunInput): Promise<void> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, { mystery_id: input.mysteryId, ...meta });

  try {
    const db = getDb();
    const env = loadEnv();
    let previousFailureNotes: string | undefined;

    for (let attempt = 1; attempt <= env.MAX_VALIDATION_ATTEMPTS; attempt++) {
      // Phase 1: logic structure
      db.update(mysteries).set({ status: "generating_logic", validation_attempts: attempt - 1 })
        .where(eq(mysteries.id, input.mysteryId)).run();
      const logicRes = await runLogicStructureAgent({
        category: input.category,
        difficulty: input.difficulty,
        playerName: input.playerName,
        previousFailureNotes,
      });
      if (!logicRes.ok) {
        previousFailureNotes = logicRes.error;
        log("logic_agent_failed", { attempt, error: logicRes.error });
        continue;
      }
      const logic: LogicStructure = logicRes.value;

      // Phase 2: structure validation
      db.update(mysteries).set({ status: "validating", validation_attempts: attempt })
        .where(eq(mysteries.id, input.mysteryId)).run();
      const valRes = await runValidationAgent(redact(logic));
      if (!valRes.ok) {
        previousFailureNotes = `validation agent malfunctioned: ${valRes.error}`;
        log("validation_agent_failed", { attempt, error: valRes.error });
        continue;
      }
      const cmp = await compareSolutions(valRes.value, logic.true_solution);
      db.update(mysteries).set({ validation_notes: cmp.notes }).where(eq(mysteries.id, input.mysteryId)).run();
      log("validation_attempt", { attempt, passed: cmp.passed });
      if (!cmp.passed) {
        previousFailureNotes = cmp.notes;
        continue;
      }

      // Structure is solvable — lock it in and write the prose.
      db.update(mysteries).set({
        status: "writing",
        logic_structure_json: JSON.stringify(logic),
        validation_passed: 1,
      }).where(eq(mysteries.id, input.mysteryId)).run();

      // Phase 3 + 4: narrative + readthrough gate (regen prose, then escalate).
      const prose = await writeAndVerifyProse({
        logicStructure: logic,
        difficulty: input.difficulty,
        maxNarrativeAttempts: env.MAX_NARRATIVE_ATTEMPTS,
        maxReadthroughAttempts: env.MAX_READTHROUGH_ATTEMPTS,
      });
      if (prose.ok) {
        db.update(mysteries).set({
          status: "ready",
          title: prose.value.title,
          narrative_text: prose.value.narrative_text,
          narrative_annotations: JSON.stringify(prose.value.annotations),
          ready_at: Math.floor(Date.now() / 1000),
        }).where(eq(mysteries.id, input.mysteryId)).run();
        log("generation_complete", { attempt });
        return;
      }

      // Prose couldn't be made solvable — escalate to a fresh logic structure.
      previousFailureNotes = prose.escalationNotes;
      db.update(mysteries).set({ validation_notes: prose.escalationNotes }).where(eq(mysteries.id, input.mysteryId)).run();
      log("readthrough_escalate", { attempt, notes: prose.escalationNotes });
    }

    // Outer loop exhausted.
    db.update(mysteries).set({
      status: "failed",
      failure_reason: "readthrough_exhausted",
      validation_passed: 0,
      validation_attempts: env.MAX_VALIDATION_ATTEMPTS,
    }).where(eq(mysteries.id, input.mysteryId)).run();
    log("generation_failed", { reason: "readthrough_exhausted" });
  } catch (err) {
    log("orchestrator_unhandled_error", { err: err instanceof Error ? err.message : String(err) });
    try {
      const db = getDb();
      db.update(mysteries).set({ status: "failed", failure_reason: "orchestrator_error" })
        .where(eq(mysteries.id, input.mysteryId)).run();
    } catch (dbErr) {
      log("orchestrator_catch_db_failed", { err: dbErr instanceof Error ? dbErr.message : String(dbErr) });
    }
  }
}
```

Note: this removes the `runNarrativeAgent` / `runTtsAgent` imports from the orchestrator — `runTtsAgent` now lives only behind the on-demand route (Task 6). Audio is no longer auto-generated.

- [ ] **Step 7: Run the full server suite**

Run: `pnpm --filter @mysterio/server test`
Expected: PASS. If a pre-existing orchestrator integration test asserted the old TTS/`synthesizing` flow, update it to expect `ready` straight after narrative and **note the change in the commit** (do not delete coverage silently).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/config/env.ts apps/server/src/services/generation/readthrough.ts apps/server/src/services/generation/readthrough.test.ts apps/server/src/services/generation/orchestrator.ts
git commit -m "feat: readthrough gate in orchestrator loop; drop auto-TTS from pipeline"
```

---

### Task 6: On-demand audio endpoint `POST /mysteries/:id/audio`

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts`
- Test: `apps/server/src/routes/mysteries.audio.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/mysteries.audio.test.ts`. Mirror the setup of any existing route test in `apps/server/src/routes/` (find one with `grep -l "buildServer\|Fastify\|inject" apps/server/src/routes/*.test.ts` and copy its harness — app construction, in-memory DB seeding). The behavioral assertions:

```ts
// Pseudocode shape — adapt to the existing route-test harness in this repo:
// 1. Seed a mystery row with status "ready", narrative_text set, audio_path NULL,
//    and a stubbed TTS that returns a known audioPath.
// 2. POST /api/mysteries/:id/audio → 200, body.audio_url === "/audio/<audioPath>",
//    and the row's audio_path is now set.
// 3. POST again → 200, same audio_url, TTS stub NOT called a second time (idempotent).
// 4. POST for a non-ready mystery → 409 { error: "not_ready" }.
// 5. POST for an unknown id → 404.
```

If the repo's route tests inject the app and cannot easily stub `runTtsAgent` (it reads a module-level provider), seed the row with `audio_path` already set for the idempotent/200 path, and assert the 404/409 branches directly (which need no TTS). Keep whatever the harness makes deterministic; do not introduce a live TTS call in a unit test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mysterio/server test src/routes/mysteries.audio.test.ts`
Expected: FAIL — route returns 404 for the POST (route not registered yet).

- [ ] **Step 3: Add the route**

In `apps/server/src/routes/mysteries.ts`, add the import at the top:

```ts
import { runTtsAgent } from "../services/generation/agents/ttsAgent.js";
```

And register this route inside `mysteriesRoutes` (after the `/mysteries/:id/debug` handler):

```ts
  app.post<{ Params: { id: string } }>("/mysteries/:id/audio", async (req, reply) => {
    const db = getDb();
    const row = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    if (row.audio_path) {
      // Idempotent — audio for a given mystery never changes.
      return { audio_url: `/audio/${row.audio_path}` };
    }
    if (row.status !== "ready" || !row.narrative_text) {
      reply.status(409);
      return { error: "not_ready" };
    }
    const ttsRes = await runTtsAgent({ mysteryId: row.id, narrativeText: row.narrative_text });
    if (!ttsRes.ok) {
      reply.status(502);
      return { error: "tts_failed", detail: ttsRes.error };
    }
    db.update(mysteries).set({ audio_path: ttsRes.audioPath }).where(eq(mysteries.id, row.id)).run();
    return { audio_url: `/audio/${ttsRes.audioPath}` };
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mysterio/server test src/routes/mysteries.audio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/mysteries.ts apps/server/src/routes/mysteries.audio.test.ts
git commit -m "feat: POST /mysteries/:id/audio — on-demand TTS, idempotent"
```

---

### Task 7: Web `settingsStore.audioEnabled`

**Files:**
- Modify: `apps/web/src/state/settingsStore.ts`

- [ ] **Step 1: Add the flag**

Replace `apps/web/src/state/settingsStore.ts` with:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  debugEnabled: boolean;
  setDebugEnabled: (v: boolean) => void;
  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      debugEnabled: false,
      setDebugEnabled: (v) => set({ debugEnabled: v }),
      audioEnabled: false,
      setAudioEnabled: (v) => set({ audioEnabled: v }),
    }),
    { name: "mysterio.settings" },
  ),
);
```

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS. (`audioEnabled` defaults to `false`; existing persisted state without the key falls back to the default.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/state/settingsStore.ts
git commit -m "feat: settingsStore.audioEnabled (persisted, default off)"
```

---

### Task 8: Settings screen audio toggle

**Files:**
- Modify: `apps/web/src/screens/SettingsScreen/SettingsScreen.tsx`

- [ ] **Step 1: Add the audio toggle row**

In `SettingsScreen.tsx`, read the new store fields at the top of the component (next to the debug ones):

```ts
  const audioEnabled = useSettingsStore((s) => s.audioEnabled);
  const setAudioEnabled = useSettingsStore((s) => s.setAudioEnabled);
```

Then add a second card directly after the existing Debug card's closing `</div>` (wrap both cards in a `display: grid; gap: 16` container if they aren't already, so they stack with spacing). The new card:

```tsx
      <div
        style={{
          background: "var(--surface)",
          padding: 16,
          borderRadius: "var(--radius)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginTop: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>🔊 Audio narration</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            Adds a "Read it to me" voice. Stories are silent by default — turn this on to show a
            button that generates the narration when you want it.
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={audioEnabled}
            onChange={(e) => setAudioEnabled(e.target.checked)}
            style={{ width: 24, height: 24 }}
            aria-label="Enable audio narration"
          />
        </label>
      </div>
```

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/SettingsScreen/SettingsScreen.tsx
git commit -m "feat: Settings — audio narration toggle"
```

---

### Task 9: Web API `generateAudio()`

**Files:**
- Modify: `apps/web/src/api/mysteries.ts`

- [ ] **Step 1: Add the API call**

Append to `apps/web/src/api/mysteries.ts`:

```ts
export function generateAudio(id: string): Promise<{ audio_url: string }> {
  return api(`/api/mysteries/${id}/audio`, { method: "POST" });
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/mysteries.ts
git commit -m "feat: web api generateAudio()"
```

---

### Task 10: PlaybackScreen audio UI matrix

Render audio only when the toggle is on: player if audio exists, else a "Generate audio" button that calls the endpoint and refetches.

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`

- [ ] **Step 1: Add the `AudioSection` component**

At the bottom of `PlaybackScreen.tsx` (module scope, below `PlaybackScreen`), add:

```tsx
function AudioSection({ mysteryId, audioUrl }: { mysteryId: string; audioUrl: string | null }) {
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: () => generateAudio(mysteryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mystery", mysteryId] }),
  });

  if (audioUrl) {
    return (
      <audio
        src={audioUrl}
        controls
        preload="metadata"
        playsInline
        style={{ width: "100%", marginBottom: 16 }}
      />
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <Button variant="secondary" disabled={gen.isPending} onClick={() => gen.mutate()}>
        {gen.isPending ? "Generating audio…" : "🔊 Generate audio"}
      </Button>
      {gen.isError && (
        <p style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>
          Couldn't generate audio. Try again.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the imports and read the toggle**

At the top of the file, add to the existing imports:

```ts
import { generateAudio } from "../../api/mysteries.js";
```

Inside `PlaybackScreen`, next to `const debugEnabled = useSettingsStore((s) => s.debugEnabled);` add:

```ts
  const audioEnabled = useSettingsStore((s) => s.audioEnabled);
```

(`useMutation`, `useQueryClient`, and `Button` are already imported in this file.)

- [ ] **Step 3: Replace the audio block**

Replace the existing block:

```tsx
        {data.audio_url && (
          <audio
            src={data.audio_url}
            controls
            preload="metadata"
            playsInline
            style={{ width: "100%", marginBottom: 16 }}
          />
        )}
```

with:

```tsx
        {audioEnabled && <AudioSection mysteryId={mysteryId} audioUrl={data.audio_url} />}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx
git commit -m "feat: PlaybackScreen — audio gated on toggle, on-demand generate button"
```

---

### Task 11: Left-align the solve-flow clue/hint section

The centering is inherited from a parent wrapper — confirm the exact element on the running app, then pin it.

**Files:**
- Modify: the offending container in the solve flow (confirmed in Step 1). Candidates: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`, `ClueSummary.tsx`, `HintControls.tsx`.

- [ ] **Step 1: Reproduce and locate**

Start the app (`pnpm --filter @mysterio/web dev`, with the server running), open a mystery's solve page (`/mysteries/:id/solve`), and inspect the clue/hint section in dev tools. Identify which ancestor sets `text-align: center` (it is inherited — none of `ClueSummary` / `HintControls` / `ClueTracker` set it themselves). Record the exact element.

- [ ] **Step 2: Apply the fix**

Set the clue/hint text container to left-aligned. Most robust: add `textAlign: "left"` to the `ClueSummary` and `HintControls` root `<div>`s (the cards), e.g. change:

```tsx
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>
```

to:

```tsx
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", textAlign: "left" }}>
```

in both `ClueSummary.tsx` and `HintControls.tsx`. If Step 1 found a single shared centered wrapper that should never have centered these, fix it there instead — but do not remove centering from components that intentionally use it (e.g. `BriefingCard`, `RevealPanel`).

- [ ] **Step 3: Verify on the running app + build**

Confirm in the browser the clues and hints now read left-aligned and nothing else regressed.
Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/SolutionScreen/
git commit -m "fix: left-align the solve-flow clue/hint section"
```

---

### Task 12: Full-stack local smoke

- [ ] **Step 1: Clean build + full test sweep**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/shared test
pnpm --filter @mysterio/server test
pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build
```
Expected: all green.

- [ ] **Step 2: Live generation smoke (real LLM)**

Start the server (kill any stale process on port 3000 first). Generate a mystery:

```bash
curl -s -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}'
```

Poll `GET /api/mysteries/:id` to `ready`. Confirm in the server logs you see `readthrough_attempt` and `generation_complete` (and `readthrough_escalate` if a draft failed the gate). Confirm the mystery reaches `ready` **with `audio_url: null`** (no auto-TTS).

- [ ] **Step 3: On-demand audio smoke**

```bash
curl -s -X POST http://localhost:3000/api/mysteries/<id>/audio
```
Expected: `{ "audio_url": "/audio/..." }`. POST again → same URL (idempotent). `GET /api/mysteries/:id` now returns that `audio_url`.

- [ ] **Step 4: Record findings**

Note the readthrough behavior (did any draft escalate? did the gate catch a dangling ref?) for the smoke summary. No commit (verification only).

---

### Task 13: Deploy + PR (USER-GATED — stop and ask first)

Do **not** run this task without explicit user go-ahead (outward-facing).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/readthrough-gate
```

- [ ] **Step 2: Deploy**

```bash
./scripts/deploy.sh 2>&1 | tail -40
```
Expected: service active, health ok.

- [ ] **Step 3: Live VM smoke**

Repeat Task 12 Steps 2–3 against `https://panther-golem.exe.xyz` — confirm a fresh mystery reaches `ready` with no audio, the readthrough gate ran, and on-demand audio generates + plays.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head feat/readthrough-gate \
  --title "Readthrough solvability gate + on-demand audio" \
  --body "<summary of the three workstreams, smoke results, and the playtest origin>"
```

- [ ] **Step 5: Hand off the iPad walkthrough** (user-run): briefing → story → solve; toggle audio in Settings and generate narration; confirm clue/hint section is left-aligned; confirm no "What latch"-style dangling references.

---

## Self-Review

**Spec coverage:**
- A1 prose-solver → Task 1. ✅
- A2 continuity auditor → Task 2. ✅
- Readthrough gate composition → Task 3. ✅
- A3 orchestrator restructuring (regen prose → escalate) → Tasks 4 (extraNotes) + 5. ✅
- A4 feedback notes → Task 3 (`notes` assembly) + Task 4 (writer consumes). ✅
- A5 persistence (`validation_notes`, `readthrough_exhausted`) → Task 5. ✅
- A6 model/temperature → Tasks 1 (0.3) & 2 (0.1), Sonnet via existing `claudeText` default. ✅
- B1 settingsStore → Task 7; B Settings UI → Task 8. ✅
- B2 remove TTS phase → Task 5 Step 6. ✅
- B3 POST /:id/audio (idempotent, 409 not-ready) → Task 6. ✅
- B4 PlaybackScreen matrix → Tasks 9 + 10. ✅
- C alignment fix → Task 11. ✅
- Testing/smoke → Task 12; deploy/PR → Task 13. ✅

**Placeholder scan:** Task 6's test is described as shape-pseudocode because the route-test harness in this repo must be matched rather than invented — the worker is told exactly which behaviors to assert and how to find the existing harness. Task 11 Step 1 is a deliberate live-render investigation (the selector cannot be known statically). All code steps that create production code show complete code.

**Type consistency:** `runProseSolverAgent` returns `ValidationAgentResult` (reused) → consumed by `compareSolutions(value, true_solution)`. `runContinuityAuditAgent` returns `{ ok; dangling }` → `runReadthroughGate` maps `dangling`. `writeAndVerifyProse` deps (`narrative`, `gate`) match `runReadthroughGate`/`runNarrativeAgent` shapes; `NarrativeOutput`/`NarrativeAgentResult` imported from `narrativeAgent.ts`. `extraNotes` added in Task 4 is consumed in Task 5's default `narrative` thunk. Env `MAX_READTHROUGH_ATTEMPTS` defined in Task 5 Step 1, read in Task 5 Step 6. Query key `["mystery", mysteryId]` (Task 10) matches `useGenerationJob`. ✅
