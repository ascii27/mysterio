import { type DifficultyId, type LogicStructure, difficultyConfig } from "@mysterio/shared";
import { tokenSetRatio } from "../services/generation/textMatch.js";

const COVERAGE_THRESHOLD = 0.75; // matches the narrative agent's clue-coverage gate

export interface DebugRow {
  id: string;
  status: string;
  difficulty: string;
  failure_reason: string | null;
  logic_structure_json: LogicStructure | null;
  narrative_text: string | null;
  validation_passed: boolean | null;
  validation_attempts: number;
  validation_notes: string | null;
}

export interface ClueCoverage {
  id: string;
  description: string;
  present: boolean;
  score: number;
}

export interface DebugView {
  id: string;
  status: string;
  failure_reason: string | null;
  logic_structure: LogicStructure | null;
  validation: { passed: boolean | null; attempts: number; notes: string | null };
  clue_coverage: ClueCoverage[];
  metrics: {
    difficulty: string;
    essential_count: number;
    false_count: number;
    word_count: number;
    target_words: number | null;
    min_words: number | null;
    max_words: number | null;
  };
}

export function buildDebugView(row: DebugRow): DebugView {
  const logic = row.logic_structure_json;
  const narrative = row.narrative_text ?? "";

  const clue_coverage: ClueCoverage[] =
    logic && narrative
      ? logic.essential_clues.map((c) => {
          const score = tokenSetRatio(c.description, narrative);
          return { id: c.id, description: c.description, present: score >= COVERAGE_THRESHOLD, score };
        })
      : [];

  let target_words: number | null = null;
  let min_words: number | null = null;
  let max_words: number | null = null;
  try {
    const d = difficultyConfig(row.difficulty as DifficultyId);
    target_words = d.targetWords;
    min_words = Math.round(d.targetWords * (1 - d.wordToleranceFraction));
    max_words = Math.round(d.targetWords * (1 + d.wordToleranceFraction));
  } catch {
    /* unknown difficulty — leave null */
  }

  const word_count = narrative ? narrative.trim().split(/\s+/).filter(Boolean).length : 0;

  return {
    id: row.id,
    status: row.status,
    failure_reason: row.failure_reason,
    logic_structure: logic,
    validation: {
      passed: row.validation_passed,
      attempts: row.validation_attempts,
      notes: row.validation_notes,
    },
    clue_coverage,
    metrics: {
      difficulty: row.difficulty,
      essential_count: logic?.essential_clues.length ?? 0,
      false_count: logic?.false_clues.length ?? 0,
      word_count,
      target_words,
      min_words,
      max_words,
    },
  };
}
