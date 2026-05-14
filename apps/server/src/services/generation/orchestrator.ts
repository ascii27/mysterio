import { eq } from "drizzle-orm";
import type { CategoryId, DifficultyId, LogicStructure } from "@mysterio/shared";
import { loadEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { runLogicStructureAgent } from "./agents/logicStructureAgent.js";
import { runValidationAgent } from "./agents/validationAgent.js";
import { compareSolutions } from "./compareSolutions.js";
import { redact } from "./redact.js";

interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
}

export async function runGeneration(input: RunInput): Promise<void> {
  const db = getDb();
  const env = loadEnv();
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, { mystery_id: input.mysteryId, ...meta });

  try {
    const validatedLogic = await regenLoop(input, env.MAX_VALIDATION_ATTEMPTS, log);
    if (!validatedLogic) {
      db.update(mysteries).set({ status: "failed", failure_reason: "validation_exhausted" })
        .where(eq(mysteries.id, input.mysteryId)).run();
      return;
    }
    db.update(mysteries).set({
      status: "writing",
      logic_structure_json: JSON.stringify(validatedLogic),
      validation_passed: 1,
    }).where(eq(mysteries.id, input.mysteryId)).run();

    // Phase 3 (narrative) and Phase 4 (TTS) come in M3 — for now we mark ready with placeholder text.
    db.update(mysteries).set({
      status: "ready",
      title: makePlaceholderTitle(validatedLogic),
      narrative_text: "[Narrative + audio land in M3.]",
      ready_at: Math.floor(Date.now() / 1000),
    }).where(eq(mysteries.id, input.mysteryId)).run();
  } catch (err) {
    log("orchestrator_unhandled_error", { err: err instanceof Error ? err.message : String(err) });
    db.update(mysteries).set({ status: "failed", failure_reason: "orchestrator_error" })
      .where(eq(mysteries.id, input.mysteryId)).run();
  }
}

async function regenLoop(
  input: RunInput,
  maxAttempts: number,
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<LogicStructure | null> {
  const db = getDb();
  let previousFailureNotes: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    db.update(mysteries).set({ status: "generating_logic", validation_attempts: attempt - 1 })
      .where(eq(mysteries.id, input.mysteryId)).run();

    const logicRes = await runLogicStructureAgent({
      category: input.category,
      difficulty: input.difficulty,
      previousFailureNotes,
    });
    if (!logicRes.ok) {
      previousFailureNotes = logicRes.error;
      log("logic_agent_failed", { attempt, error: logicRes.error });
      continue;
    }
    const logic = logicRes.value;

    db.update(mysteries).set({ status: "validating", validation_attempts: attempt })
      .where(eq(mysteries.id, input.mysteryId)).run();

    const valRes = await runValidationAgent(redact(logic));
    if (!valRes.ok) {
      previousFailureNotes = `validation agent malfunctioned: ${valRes.error}`;
      log("validation_agent_failed", { attempt, error: valRes.error });
      continue;
    }
    const cmp = await compareSolutions(valRes.value, logic.true_solution);
    db.update(mysteries).set({ validation_notes: cmp.notes }).where(eq(mysteries.id, input.mysteryId)).run();
    log("validation_attempt", { attempt, passed: cmp.passed, who_match: cmp.who_match, how_match: cmp.how_match, why_match: cmp.why_match });
    if (cmp.passed) return logic;
    previousFailureNotes = cmp.notes;
  }
  return null;
}

function makePlaceholderTitle(ls: LogicStructure): string {
  const parts = ls.setting.split(/[\s.]+/).slice(0, 3).join(" ");
  return parts.length > 0 ? `Mystery at ${parts}` : "An Untitled Mystery";
}
