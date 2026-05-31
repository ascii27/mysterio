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
