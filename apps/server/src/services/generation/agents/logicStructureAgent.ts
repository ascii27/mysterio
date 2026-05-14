import {
  type CategoryId,
  type DifficultyId,
  type LogicStructure,
  logicStructureSchema,
} from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { buildLogicStructureSystem } from "../prompts/logicStructure.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";

export interface LogicStructureAgentInput {
  category: CategoryId;
  difficulty: DifficultyId;
  previousFailureNotes?: string;
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
        { type: "text", text: buildLogicStructureSystem(input.difficulty) },
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
      return { ok: true, value: result.data, attemptsUsed: attempt };
    }
    errors.push(`Zod validation failed: ${formatZodIssues(result.error)}`);
  }
  return {
    ok: false,
    error: `logic structure agent exhausted internal retries: ${errors.join(" | ")}`,
    attemptsUsed: MAX_INTERNAL_ATTEMPTS,
  };
}

function buildUserMessage(input: LogicStructureAgentInput, lastError?: string): string {
  const base = `Generate a ${input.difficulty} ${input.category} mystery.`;
  if (input.previousFailureNotes) {
    return `${base}\n\nYour previous attempt failed validation. Fix these issues:\n${input.previousFailureNotes}`;
  }
  if (lastError) {
    return `${base}\n\nYour previous output had a problem: ${lastError}\nReturn a corrected JSON object that satisfies the schema exactly.`;
  }
  return base;
}

function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
