import {
  type AgeRange,
  type DifficultyId,
  type LogicStructure,
  type NarrativeAnnotation,
} from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { parseNarrativeAnnotations } from "../parseAnnotations.js";
import { buildNarrativeSystem } from "../prompts/narrative.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { findMissingClues } from "../textMatch.js";

const narrativeOutputSchema = z.object({
  title: z.string().min(3).max(120),
  narrative_text: z.string().min(200),
});

export interface NarrativeOutput {
  title: string;
  narrative_text: string;
  annotations: NarrativeAnnotation[];
}

export type NarrativeAgentResult =
  | { ok: true; value: NarrativeOutput; attemptsUsed: number; missingCluesByAttempt: string[][] }
  | { ok: false; error: string; attemptsUsed: number; missingCluesByAttempt: string[][] };

export interface NarrativeAgentInput {
  logicStructure: LogicStructure;
  difficulty: DifficultyId;
  ageRange: AgeRange;
  maxAttempts: number;
  extraNotes?: string;
}

export async function runNarrativeAgent(input: NarrativeAgentInput): Promise<NarrativeAgentResult> {
  const missingByAttempt: string[][] = [];
  let lastErr = "";

  // Strip the answer before sending to the narrative agent so it can't be lazy.
  const safeForNarrative = redactForNarrative(input.logicStructure);

  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    const userMsg = buildUserMessage(
      safeForNarrative,
      missingByAttempt[missingByAttempt.length - 1],
      input.extraNotes,
    );
    let raw: string;
    try {
      raw = await claudeText({
        label: `narrativeAgent:attempt${attempt}`,
        system: [
          { type: "text", text: SAFETY_PREAMBLE, cache: true },
          { type: "text", text: buildNarrativeSystem(input.difficulty, input.ageRange) },
        ],
        user: userMsg,
        maxTokens: 4096,
        temperature: 0.85,
      });
    } catch (e) {
      lastErr = `claude call failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(extractJson(raw)); }
    catch (e) {
      lastErr = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = narrativeOutputSchema.safeParse(parsed);
    if (!result.success) {
      lastErr = `Zod failed: ${result.error.issues.map((i) => i.message).join("; ")}`;
      continue;
    }

    // Strip [p:…]/[c:…] tags from the LLM output before running the coverage check,
    // so the text-match runs against the same clean prose the kid will read.
    const { text: cleanText, annotations } = parseNarrativeAnnotations(
      result.data.narrative_text,
      input.logicStructure,
    );

    const missing = findMissingClues(input.logicStructure.essential_clues, cleanText, 0.75);
    missingByAttempt.push(missing);
    if (missing.length === 0) {
      return {
        ok: true,
        value: { title: result.data.title, narrative_text: cleanText, annotations },
        attemptsUsed: attempt,
        missingCluesByAttempt: missingByAttempt,
      };
    }
    lastErr = `narrative missing clues: ${missing.join(", ")}`;
  }
  return { ok: false, error: lastErr, attemptsUsed: input.maxAttempts, missingCluesByAttempt: missingByAttempt };
}

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

function redactForNarrative(ls: LogicStructure) {
  return {
    case_type: ls.case_type,
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
