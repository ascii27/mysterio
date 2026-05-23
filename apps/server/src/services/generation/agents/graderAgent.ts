import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { GRADER_SYSTEM } from "../prompts/grader.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { formatZodIssues } from "../zodFormat.js";

const graderResultSchema = z.object({
  match: z.boolean(),
  reason: z.string().min(3),
});

export type GraderResult = z.infer<typeof graderResultSchema>;

export async function runGrader(candidate: string, reference: string): Promise<GraderResult> {
  const raw = await claudeText({
    label: "graderAgent",
    system: [
      { type: "text", text: SAFETY_PREAMBLE, cache: true },
      { type: "text", text: GRADER_SYSTEM, cache: true },
    ],
    user: `candidate: ${JSON.stringify(candidate)}\nreference: ${JSON.stringify(reference)}`,
    maxTokens: 256,
    temperature: 0.0,
  });

  let raw_parsed: unknown;
  try {
    raw_parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    return { match: false, reason: `grader output not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = graderResultSchema.safeParse(raw_parsed);
  if (!parsed.success) {
    return { match: false, reason: `grader output malformed: ${formatZodIssues(parsed.error)}` };
  }
  return parsed.data;
}
