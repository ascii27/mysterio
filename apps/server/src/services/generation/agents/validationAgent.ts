import type { RedactedLogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { VALIDATION_SYSTEM } from "../prompts/validation.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { formatZodIssues } from "../zodFormat.js";

export const validationGuessSchema = z.object({
  guess: z.object({
    who: z.string().min(1),
    how: z.string().min(3),
    why: z.string().min(3),
  }),
  reasoning: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

export type ValidationGuess = z.infer<typeof validationGuessSchema>;

export type ValidationAgentResult =
  | { ok: true; value: ValidationGuess }
  | { ok: false; error: string };

const MAX_INTERNAL_ATTEMPTS = 2;

export async function runValidationAgent(
  redacted: RedactedLogicStructure,
): Promise<ValidationAgentResult> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
    const raw = await claudeText({
      label: `validationAgent:attempt${attempt}`,
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: VALIDATION_SYSTEM, cache: true },
      ],
      user: `Solve this mystery from the essential clues alone.\n\n${JSON.stringify(redacted, null, 2)}${
        lastError ? `\n\nYour previous attempt was malformed: ${lastError}` : ""
      }`,
      maxTokens: 1024,
      temperature: 0.3,
    });

    const json = extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      lastError = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = validationGuessSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `Zod failed: ${formatZodIssues(result.error)}`;
      continue;
    }
    const validIds = new Set(redacted.characters.map((c) => c.id));
    if (!validIds.has(result.data.guess.who)) {
      lastError = `guess.who '${result.data.guess.who}' is not a valid character id. Valid ids: ${[...validIds].join(", ")}`;
      continue;
    }
    return { ok: true, value: result.data };
  }
  return { ok: false, error: lastError || "validation agent failed without an error message" };
}
