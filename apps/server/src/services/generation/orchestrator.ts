import { eq } from "drizzle-orm";
import type { AgeRange, CategoryId, DifficultyId, LogicStructure } from "@mysterio/shared";
import { loadEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { runLogicStructureAgent } from "./agents/logicStructureAgent.js";
import { runValidationAgent } from "./agents/validationAgent.js";
import { runCoverImageAgent } from "./agents/coverImageAgent.js";
import { compareSolutions } from "./compareSolutions.js";
import { redact } from "./redact.js";
import { writeAndVerifyProse } from "./readthrough.js";

interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
  ageRange: AgeRange;
  /** When false, skips cover-image generation. Defaults to true (image generated). Spec-4 parent-toggle hook. */
  generateImage?: boolean;
}

export async function runGeneration(input: RunInput): Promise<void> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, { mystery_id: input.mysteryId, ...meta });

  try {
    const db = getDb();
    const env = loadEnv();
    let previousFailureNotes: string | undefined;
    let proseAttempted = false;

    for (let attempt = 1; attempt <= env.MAX_VALIDATION_ATTEMPTS; attempt++) {
      // Phase 1: logic structure
      await db.update(mysteries).set({ status: "generating_logic", validation_attempts: attempt - 1 })
        .where(eq(mysteries.id, input.mysteryId));
      const logicRes = await runLogicStructureAgent({
        category: input.category,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        previousFailureNotes,
      });
      if (!logicRes.ok) {
        previousFailureNotes = logicRes.error;
        log("logic_agent_failed", { attempt, error: logicRes.error });
        continue;
      }
      const logic: LogicStructure = logicRes.value;

      // Phase 2: structure validation
      await db.update(mysteries).set({ status: "validating", validation_attempts: attempt })
        .where(eq(mysteries.id, input.mysteryId));
      const valRes = await runValidationAgent(redact(logic));
      if (!valRes.ok) {
        previousFailureNotes = `validation agent malfunctioned: ${valRes.error}`;
        log("validation_agent_failed", { attempt, error: valRes.error });
        continue;
      }
      const cmp = await compareSolutions(valRes.value, logic.true_solution);
      await db.update(mysteries).set({ validation_notes: cmp.notes }).where(eq(mysteries.id, input.mysteryId));
      log("validation_attempt", { attempt, passed: cmp.passed, who_match: cmp.who_match, how_match: cmp.how_match, why_match: cmp.why_match });
      if (!cmp.passed) {
        previousFailureNotes = cmp.notes;
        continue;
      }

      // Structure is solvable — lock it in and write the prose.
      await db.update(mysteries).set({
        status: "writing",
        logic_structure_json: logic,
        validation_passed: true,
      }).where(eq(mysteries.id, input.mysteryId));

      // Phase 3 + 4: narrative + readthrough gate (regen prose, then escalate).
      proseAttempted = true;
      const prose = await writeAndVerifyProse({
        logicStructure: logic,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        maxNarrativeAttempts: env.MAX_NARRATIVE_ATTEMPTS,
        maxReadthroughAttempts: env.MAX_READTHROUGH_ATTEMPTS,
      });
      if (prose.ok) {
        // Best-effort cover image — never blocks `ready`. A failure (rate limit,
        // moderation refusal, disk) leaves cover_image_path null and the frontend
        // falls back to SceneArt.
        let coverImagePath: string | null = null;
        if (input.generateImage !== false) {
          const cover = await runCoverImageAgent({
            mysteryId: input.mysteryId,
            category: input.category,
            title: prose.value.title,
            centralQuestion: logic.central_question,
            setting: logic.setting,
          });
          if (cover.ok) {
            coverImagePath = cover.coverImagePath;
          } else {
            log("cover_image_skipped", { reason: cover.error });
          }
        }
        await db.update(mysteries).set({
          status: "ready",
          title: prose.value.title,
          narrative_text: prose.value.narrative_text,
          narrative_annotations: prose.value.annotations,
          cover_image_path: coverImagePath,
          ready_at: new Date(),
        }).where(eq(mysteries.id, input.mysteryId));
        log("generation_complete", { attempt, cover: coverImagePath !== null });
        return;
      }

      // Prose couldn't be made solvable — escalate to a fresh logic structure.
      previousFailureNotes = prose.escalationNotes;
      await db.update(mysteries).set({ validation_notes: prose.escalationNotes }).where(eq(mysteries.id, input.mysteryId));
      log("readthrough_escalate", { attempt, notes: prose.escalationNotes });
    }

    // Outer loop exhausted.
    await db.update(mysteries).set({
      status: "failed",
      failure_reason: proseAttempted ? "readthrough_exhausted" : "validation_exhausted",
      validation_passed: false,
      validation_attempts: env.MAX_VALIDATION_ATTEMPTS,
    }).where(eq(mysteries.id, input.mysteryId));
    log("generation_failed", { reason: proseAttempted ? "readthrough_exhausted" : "validation_exhausted" });
  } catch (err) {
    log("orchestrator_unhandled_error", { err: err instanceof Error ? err.message : String(err) });
    try {
      const db = getDb();
      await db.update(mysteries).set({ status: "failed", failure_reason: "orchestrator_error" })
        .where(eq(mysteries.id, input.mysteryId));
    } catch (dbErr) {
      log("orchestrator_catch_db_failed", { err: dbErr instanceof Error ? dbErr.message : String(dbErr) });
      // mystery stays in non-terminal status; M1.9's startup cleanup will recover it
    }
  }
}
