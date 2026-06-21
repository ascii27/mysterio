import {
  type AgeRange,
  type CategoryId,
  type DifficultyId,
  type LogicStructure,
  difficultyConfig,
  logicStructureSchema,
} from "@mysterio/shared";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { buildLogicStructureSystem } from "../prompts/logicStructure.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import type { CastPool } from "../roster.js";
import { formatZodIssues } from "../zodFormat.js";

export interface LogicStructureAgentInput {
  category: CategoryId;
  difficulty: DifficultyId;
  ageRange: AgeRange;
  previousFailureNotes?: string;
  castPool?: CastPool;
}

export type LogicStructureAgentResult =
  | { ok: true; value: LogicStructure; attemptsUsed: number }
  | { ok: false; error: string; attemptsUsed: number };

const MAX_INTERNAL_ATTEMPTS = 3;

export async function runLogicStructureAgent(
  input: LogicStructureAgentInput,
): Promise<LogicStructureAgentResult> {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
    const userMsg = buildUserMessage(input, errors[errors.length - 1]);
    const raw = await claudeText({
      label: `logicStructureAgent:attempt${attempt}`,
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: buildLogicStructureSystem(input.difficulty, input.ageRange) },
      ],
      user: userMsg,
      maxTokens: 4096,
      temperature: 0.8,
    });

    const json = extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      errors.push(`JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const result = logicStructureSchema.safeParse(parsed);
    if (result.success) {
      const countIssue = checkDifficultyCounts(result.data, input.difficulty);
      if (countIssue) {
        errors.push(`Difficulty-count check failed: ${countIssue}`);
        continue;
      }
      return { ok: true, value: result.data, attemptsUsed: attempt };
    }
    errors.push(`Zod validation failed: ${formatZodIssues(result.error)}`);
  }
  return {
    ok: false,
    error: errors[errors.length - 1] ?? "logic structure agent failed without recording an error",
    attemptsUsed: MAX_INTERNAL_ATTEMPTS,
  };
}

export function buildCastPoolUserSection(pool?: CastPool): string {
  if (!pool || pool.characters.length === 0) return "";
  const people = pool.characters
    .map((c) => `- id "${c.id}", ${c.name}: ${c.description}${c.traits ? ` (traits: ${c.traits})` : ""}`)
    .join("\n");
  const placeLines = pool.places.map((p) => `- ${p.name}: ${p.description}`).join("\n");
  const placePart = placeLines
    ? `\n\nSet this case in ONE of these Maple Hollow places (weave its name into the setting):\n${placeLines}`
    : "";
  return `\n\nCast this mystery from these Maple Hollow townsfolk — reuse each one's EXACT id and name as suspects/witnesses/bystanders. You may add AT MOST ONE new resident if the plot needs it:\n${people}${placePart}`;
}

function buildUserMessage(input: LogicStructureAgentInput, lastError?: string): string {
  const base = `Generate a ${input.difficulty} ${input.category} mystery.${buildCastPoolUserSection(input.castPool)}`;
  if (input.previousFailureNotes) {
    const parseNote = lastError ? `\n\nNote: your most recent JSON output also had a structural problem: ${lastError}` : "";
    return `${base}\n\nYour previous attempt failed validation. Fix these issues:\n${input.previousFailureNotes}${parseNote}`;
  }
  if (lastError) {
    return `${base}\n\nYour previous output had a problem: ${lastError}\nReturn a corrected JSON object that satisfies the schema exactly.`;
  }
  return base;
}

function checkDifficultyCounts(ls: LogicStructure, difficulty: DifficultyId): string | null {
  const d = difficultyConfig(difficulty);
  const issues: string[] = [];
  if (ls.essential_clues.length !== d.essentialClues) {
    issues.push(`essential_clues.length must be ${d.essentialClues} (got ${ls.essential_clues.length})`);
  }
  if (ls.false_clues.length < d.falseCluesMin || ls.false_clues.length > d.falseCluesMax) {
    issues.push(`false_clues.length must be ${d.falseCluesMin}-${d.falseCluesMax} (got ${ls.false_clues.length})`);
  }
  return issues.length === 0 ? null : issues.join("; ");
}

