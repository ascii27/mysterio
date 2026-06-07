import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  default_difficulty: text("default_difficulty").notNull(),
  age_range: text("age_range").notNull().default("10-11"),
  avatar_description: text("avatar_description"),
  avatar_image_path: text("avatar_image_path"),
  created_at: createdAt(),
}, (t) => ({
  difficultyCheck: check("players_difficulty_chk", sql`${t.default_difficulty} IN ('easy','medium','hard')`),
  ageRangeCheck: check("players_age_range_chk", sql`${t.age_range} IN ('8-9','10-11','12-13')`),
}));

export const mysteries = pgTable("mysteries", {
  id: text("id").primaryKey(),
  player_id: text("player_id").references(() => players.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  target_age_range: text("target_age_range"),
  status: text("status").notNull(),
  title: text("title"),
  logic_structure_json: jsonb("logic_structure_json").$type<LogicStructure>(),
  narrative_text: text("narrative_text"),
  narrative_annotations: jsonb("narrative_annotations").$type<NarrativeAnnotation[]>(),
  audio_path: text("audio_path"),
  cover_image_path: text("cover_image_path"),
  validation_passed: boolean("validation_passed"),
  validation_attempts: integer("validation_attempts").notNull().default(0),
  validation_notes: text("validation_notes"),
  failure_reason: text("failure_reason"),
  created_at: createdAt(),
  ready_at: timestamp("ready_at", { withTimezone: true }),
}, (t) => ({
  difficultyCheck: check("mysteries_difficulty_chk", sql`${t.difficulty} IN ('easy','medium','hard')`),
  statusCheck: check(
    "mysteries_status_chk",
    sql`${t.status} IN ('pending','generating_logic','validating','writing','synthesizing','ready','failed')`,
  ),
  playerIdx: index("idx_mysteries_player").on(t.player_id, t.created_at),
  activeIdx: index("idx_mysteries_active").on(t.status),
}));

export const clues = pgTable("clues", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  category_type: text("category_type").notNull(),
  content: text("content").notNull(),
  audio_timestamp_ms: integer("audio_timestamp_ms"),
  source: text("source").notNull().default("manual"),
  annotation_id: text("annotation_id"),
  created_at: createdAt(),
}, (t) => ({
  categoryCheck: check("clues_category_chk", sql`${t.category_type} IN ('character','item','location','event','note')`),
  sourceCheck: check("clues_source_chk", sql`${t.source} IN ('manual','annotation')`),
  mysteryIdx: index("idx_clues_mystery").on(t.mystery_id),
  annotationUniq: uniqueIndex("clues_mystery_annotation_uniq")
    .on(t.mystery_id, t.player_id, t.annotation_id)
    .where(sql`${t.annotation_id} IS NOT NULL`),
  mysteryPlayerIdx: index("idx_clues_mystery_player").on(t.mystery_id, t.player_id),
}));

export const solutions = pgTable("solutions", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  guess_who: text("guess_who"),
  guess_how: text("guess_how"),
  guess_why: text("guess_why"),
  is_correct: boolean("is_correct").notNull(),
  who_match: boolean("who_match"),
  how_match: boolean("how_match"),
  why_match: boolean("why_match"),
  hints_used: integer("hints_used").notNull().default(0),
  gave_up: boolean("gave_up").notNull().default(false),
  explanation: text("explanation"),
  created_at: createdAt(),
}, (t) => ({
  mysteryUniq: uniqueIndex("solutions_mystery_uniq").on(t.mystery_id, t.player_id),
}));

export const hints = pgTable("hints", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  player_id: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  created_at: createdAt(),
}, (t) => ({
  mysteryPlayerIdx: index("idx_hints_mystery_player").on(t.mystery_id, t.player_id),
}));
