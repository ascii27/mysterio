import type { TrueSolution } from "@mysterio/shared";
import type { ValidationGuess } from "./agents/validationAgent.js";
import { runGrader } from "./agents/graderAgent.js";
import type { GraderResult } from "./agents/graderAgent.js";

export interface CompareResult {
  passed: boolean;
  who_match: boolean;
  how_match: boolean;
  why_match: boolean;
  confidence_floor_violated: boolean;
  notes: string;
}

const CONFIDENCE_FLOOR = 0.5;

/** Optional injection for tests. If provided, used instead of the live grader call. */
export interface CompareDeps {
  grader?: (candidate: string, reference: string) => Promise<{ match: boolean; reason: string }>;
}

export async function compareSolutions(
  guess: ValidationGuess,
  truth: TrueSolution,
  deps: CompareDeps = {},
): Promise<CompareResult> {
  const grader = deps.grader ?? runGrader;
  const who_match = guess.guess.who === truth.who_did_it;
  const confidence_floor_violated = guess.confidence < CONFIDENCE_FLOOR;

  if (!who_match) {
    return {
      passed: false,
      who_match: false,
      how_match: false,
      why_match: false,
      confidence_floor_violated,
      notes: buildNotes({
        who_match: false,
        confidence_floor_violated,
        guess, truth,
        howRes: null,
        whyRes: null,
      }),
    };
  }

  const [howRes, whyRes] = await Promise.all([
    grader(guess.guess.how, truth.how),
    grader(guess.guess.why, truth.why),
  ]);

  const passed = howRes.match && whyRes.match && !confidence_floor_violated;

  return {
    passed,
    who_match: true,
    how_match: howRes.match,
    why_match: whyRes.match,
    confidence_floor_violated,
    notes: buildNotes({
      who_match: true,
      confidence_floor_violated,
      guess, truth,
      howRes,
      whyRes,
    }),
  };
}

function sanitize(s: string): string {
  return s.replace(/"/g, "'");
}

function buildNotes(input: {
  who_match: boolean;
  confidence_floor_violated: boolean;
  guess: ValidationGuess;
  truth: TrueSolution;
  howRes: GraderResult | null;
  whyRes: GraderResult | null;
}): string {
  const parts: string[] = [];
  if (!input.who_match) {
    parts.push(`The validator guessed "${sanitize(input.guess.guess.who)}" but the culprit is "${sanitize(input.truth.who_did_it)}". The clues did not uniquely point to the right character. Add or sharpen a clue that distinguishes the culprit from the other suspects.`);
  }
  if (input.howRes !== null && !input.howRes.match) {
    parts.push(`The validator's "how" did not match. Validator said: "${sanitize(input.guess.guess.how)}". Truth: "${sanitize(input.truth.how)}". Grader said: "${sanitize(input.howRes.reason)}". Make the method clue more concrete or remove ambiguity.`);
  }
  if (input.whyRes !== null && !input.whyRes.match) {
    parts.push(`The validator's "why" did not match. Validator said: "${sanitize(input.guess.guess.why)}". Truth: "${sanitize(input.truth.why)}". Grader said: "${sanitize(input.whyRes.reason)}". Make the motive easier to read from the clues.`);
  }
  if (input.confidence_floor_violated) {
    parts.push(`The validator's confidence (${input.guess.confidence}) was below 0.5 — the clues did not feel decisive even where they were correct. Tighten the essential clues so they leave less room for alternative suspects.`);
  }
  if (parts.length === 0) parts.push("Validation passed.");
  return parts.join("\n\n");
}
