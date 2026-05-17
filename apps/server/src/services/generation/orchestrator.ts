import { eq } from "drizzle-orm";
import type { CategoryId, DifficultyId, LogicStructure } from "@mysterio/shared";
import { loadEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { runLogicStructureAgent } from "./agents/logicStructureAgent.js";
import { runNarrativeAgent } from "./agents/narrativeAgent.js";
import { runValidationAgent } from "./agents/validationAgent.js";
import { compareSolutions } from "./compareSolutions.js";
import { redact } from "./redact.js";

interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
  playerName: string;
}

export async function runGeneration(input: RunInput): Promise<void> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, { mystery_id: input.mysteryId, ...meta });

  try {
    const db = getDb();
    const env = loadEnv();
    const validatedLogic = await regenLoop(input, env.MAX_VALIDATION_ATTEMPTS, log);
    if (!validatedLogic) {
      db.update(mysteries).set({
        status: "failed",
        failure_reason: "validation_exhausted",
        validation_attempts: env.MAX_VALIDATION_ATTEMPTS,
        validation_passed: 0,
      }).where(eq(mysteries.id, input.mysteryId)).run();
      return;
    }
    // Transition to "writing" — logic is locked in, narrative agent is about to run.
    db.update(mysteries).set({
      status: "writing",
      logic_structure_json: JSON.stringify(validatedLogic),
      validation_passed: 1,
    }).where(eq(mysteries.id, input.mysteryId)).run();

    // Phase 3: narrative
    const narrativeRes = await runNarrativeAgent({
      logicStructure: validatedLogic,
      difficulty: input.difficulty,
      maxAttempts: env.MAX_NARRATIVE_ATTEMPTS,
    });
    log("narrative_done", { ok: narrativeRes.ok, attempts: narrativeRes.attemptsUsed });

    if (!narrativeRes.ok) {
      db.update(mysteries).set({
        status: "failed",
        failure_reason: "narrative_clue_coverage",
        validation_notes: `narrative agent could not include all essential clues. last missing: ${
          narrativeRes.missingCluesByAttempt[narrativeRes.missingCluesByAttempt.length - 1]?.join(", ") ?? "?"
        }`,
      }).where(eq(mysteries.id, input.mysteryId)).run();
      return;
    }

    // Narrative succeeded. TTS lands in M3.4-new — for now, jump straight to "ready" with audio_path unset.
    db.update(mysteries).set({
      status: "ready",
      title: narrativeRes.value.title,
      narrative_text: narrativeRes.value.narrative_text,
      ready_at: Math.floor(Date.now() / 1000),
    }).where(eq(mysteries.id, input.mysteryId)).run();
  } catch (err) {
    log("orchestrator_unhandled_error", { err: err instanceof Error ? err.message : String(err) });
    try {
      const db = getDb();
      db.update(mysteries).set({ status: "failed", failure_reason: "orchestrator_error" })
        .where(eq(mysteries.id, input.mysteryId)).run();
    } catch (dbErr) {
      log("orchestrator_catch_db_failed", {
        err: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
      // mystery stays in non-terminal status; M1.9's startup cleanup will recover it
    }
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
      playerName: input.playerName,
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

