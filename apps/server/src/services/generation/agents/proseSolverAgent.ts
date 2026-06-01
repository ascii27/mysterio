import { claudeText, extractJson } from "../../anthropic/client.js";
import { PROSE_SOLVER_SYSTEM } from "../prompts/proseSolver.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { formatZodIssues } from "../zodFormat.js";
import { validationGuessSchema } from "./validationAgent.js";
import type { ValidationAgentResult } from "./validationAgent.js";

type ClaudeCall = typeof claudeText;

export interface ProseSolverInput {
  centralQuestion: string;
  narrativeText: string;
  characters: Array<{ id: string; name: string; role: string; description: string }>;
}

const MAX_INTERNAL_ATTEMPTS = 2;

export async function runProseSolverAgent(
  input: ProseSolverInput,
  deps: { call?: ClaudeCall } = {},
): Promise<ValidationAgentResult> {
  const call = deps.call ?? claudeText;
  const validIds = new Set(input.characters.map((c) => c.id));
  let lastError = "";

  const user = [
    "THE CASE:",
    input.centralQuestion,
    "",
    "THE SUSPECTS:",
    JSON.stringify(input.characters, null, 2),
    "",
    "THE STORY:",
    input.narrativeText,
  ].join("\n");

  for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
    const raw = await call({
      label: `proseSolverAgent:attempt${attempt}`,
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: PROSE_SOLVER_SYSTEM, cache: true },
      ],
      user: lastError ? `${user}\n\nYour previous attempt was malformed: ${lastError}` : user,
      maxTokens: 1024,
      temperature: 0.3,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastError = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = validationGuessSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `Zod failed: ${formatZodIssues(result.error)}`;
      continue;
    }
    if (!validIds.has(result.data.guess.who)) {
      lastError = `guess.who '${result.data.guess.who}' is not a valid character id. Valid ids: ${[...validIds].join(", ")}`;
      continue;
    }
    return { ok: true, value: result.data };
  }
  return { ok: false, error: lastError || "prose solver failed without an error message" };
}
