import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { EXPLANATION_SYSTEM } from "../prompts/explanation.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";

const outSchema = z.object({ explanation: z.string().min(50) });

export interface ExplanationInput {
  logicStructure: LogicStructure;
  guess: { who: string | null; how: string | null; why: string | null };
  outcome: "correct" | "partial" | "incorrect" | "gave_up";
}

export async function runExplanation(input: ExplanationInput): Promise<string> {
  let raw: string;
  try {
    raw = await claudeText({
      label: "explanationAgent",
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: EXPLANATION_SYSTEM },
      ],
      user: JSON.stringify({
        logic_structure: input.logicStructure,
        guess: input.guess,
        outcome: input.outcome,
      }, null, 2),
      maxTokens: 512,
      temperature: 0.6,
    });
  } catch {
    return "We'll skip the long explanation this time — but great work taking on the case.";
  }
  try {
    const parsed = outSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) return "We'll skip the long explanation this time — but great work taking on the case.";
    return parsed.data.explanation;
  } catch {
    return "We'll skip the long explanation this time — but great work taking on the case.";
  }
}
