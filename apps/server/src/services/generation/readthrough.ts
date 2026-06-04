import type { AgeRange, DifficultyId, LogicStructure, TrueSolution } from "@mysterio/shared";
import { logger } from "../../utils/logger.js";
import { runContinuityAuditAgent } from "./agents/continuityAuditAgent.js";
import type { ContinuityAuditInput, ContinuityAuditResult } from "./agents/continuityAuditAgent.js";
import { runNarrativeAgent } from "./agents/narrativeAgent.js";
import type { NarrativeAgentResult, NarrativeOutput } from "./agents/narrativeAgent.js";
import { runProseSolverAgent } from "./agents/proseSolverAgent.js";
import type { ProseSolverInput } from "./agents/proseSolverAgent.js";
import type { ValidationAgentResult, ValidationGuess } from "./agents/validationAgent.js";
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
  solver?: (input: ProseSolverInput) => Promise<ValidationAgentResult>;
  auditor?: (input: ContinuityAuditInput) => Promise<ContinuityAuditResult>;
  compare?: (guess: ValidationGuess, truth: TrueSolution) => Promise<CompareResult>;
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

export interface WriteAndVerifyInput {
  logicStructure: LogicStructure;
  difficulty: DifficultyId;
  ageRange: AgeRange;
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
        ageRange: input.ageRange,
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
    logger.info("readthrough_attempt", { attempt, passed: verdict.passed });
    if (verdict.passed) return { ok: true, value: draft.value };
    notes = verdict.notes;
  }
  return {
    ok: false,
    escalationNotes: `The prose could not be made solvable after ${input.maxReadthroughAttempts} attempts. Last problem: ${notes ?? "unknown"}`,
  };
}
