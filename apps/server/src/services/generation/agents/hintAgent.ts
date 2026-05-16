import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { HINT_SYSTEM } from "../prompts/hint.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";

const outSchema = z.object({ hint: z.string().min(5).max(300) });

const FALLBACK = "Re-listen to the part where the detective notices something out of place.";

export async function runHintAgent(input: {
  logicStructure: LogicStructure;
  priorHints: string[];
}): Promise<string> {
  let raw: string;
  try {
    raw = await claudeText({
      label: "hintAgent",
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: HINT_SYSTEM },
      ],
      user: JSON.stringify({
        logic_structure: input.logicStructure,
        prior_hints: input.priorHints,
      }, null, 2),
      maxTokens: 256,
      temperature: 0.6,
    });
  } catch {
    return FALLBACK;
  }
  try {
    const parsed = outSchema.safeParse(JSON.parse(extractJson(raw)));
    return parsed.success ? parsed.data.hint : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
