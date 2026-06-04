PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_mysteries` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text,
	`category` text NOT NULL,
	`difficulty` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`logic_structure_json` text,
	`narrative_text` text,
	`narrative_annotations` text,
	`audio_path` text,
	`cover_image_path` text,
	`validation_passed` integer,
	`validation_attempts` integer DEFAULT 0 NOT NULL,
	`validation_notes` text,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "mysteries_difficulty_chk" CHECK("__new_mysteries"."difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "mysteries_status_chk" CHECK("__new_mysteries"."status" IN ('pending','generating_logic','validating','writing','synthesizing','ready','failed'))
);
--> statement-breakpoint
INSERT INTO `__new_mysteries`("id", "player_id", "category", "difficulty", "status", "title", "logic_structure_json", "narrative_text", "narrative_annotations", "audio_path", "cover_image_path", "validation_passed", "validation_attempts", "validation_notes", "failure_reason", "created_at", "ready_at") SELECT "id", "player_id", "category", "difficulty", "status", "title", "logic_structure_json", "narrative_text", "narrative_annotations", "audio_path", "cover_image_path", "validation_passed", "validation_attempts", "validation_notes", "failure_reason", "created_at", "ready_at" FROM `mysteries`;--> statement-breakpoint
DROP TABLE `mysteries`;--> statement-breakpoint
ALTER TABLE `__new_mysteries` RENAME TO `mysteries`;--> statement-breakpoint
CREATE TABLE `__new_players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_difficulty` text NOT NULL,
	`age_range` text DEFAULT '10-11' NOT NULL,
	`avatar_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "players_difficulty_chk" CHECK("__new_players"."default_difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "players_age_range_chk" CHECK("__new_players"."age_range" IN ('8-9','10-11','12-13'))
);
--> statement-breakpoint
INSERT INTO `__new_players`("id", "name", "default_difficulty", "age_range", "avatar_description", "created_at") SELECT "id", "name", "default_difficulty", '10-11', NULL, "created_at" FROM `players`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
ALTER TABLE `__new_players` RENAME TO `players`;--> statement-breakpoint
DROP INDEX IF EXISTS `clues_mystery_annotation_uniq`;--> statement-breakpoint
CREATE TABLE `__new_clues` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`player_id` text NOT NULL,
	`category_type` text NOT NULL,
	`content` text NOT NULL,
	`audio_timestamp_ms` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`annotation_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "clues_category_chk" CHECK("__new_clues"."category_type" IN ('character','item','location','event','note')),
	CONSTRAINT "clues_source_chk" CHECK("__new_clues"."source" IN ('manual','annotation'))
);
--> statement-breakpoint
INSERT INTO `__new_clues`("id", "mystery_id", "player_id", "category_type", "content", "audio_timestamp_ms", "source", "annotation_id", "created_at") SELECT "id", "mystery_id", (SELECT "player_id" FROM "mysteries" WHERE "mysteries"."id" = "clues"."mystery_id"), "category_type", "content", "audio_timestamp_ms", "source", "annotation_id", "created_at" FROM `clues`;--> statement-breakpoint
DROP TABLE `clues`;--> statement-breakpoint
ALTER TABLE `__new_clues` RENAME TO `clues`;--> statement-breakpoint
DROP INDEX IF EXISTS `solutions_mystery_uniq`;--> statement-breakpoint
CREATE TABLE `__new_solutions` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`player_id` text NOT NULL,
	`guess_who` text,
	`guess_how` text,
	`guess_why` text,
	`is_correct` integer NOT NULL,
	`who_match` integer,
	`how_match` integer,
	`why_match` integer,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`gave_up` integer DEFAULT 0 NOT NULL,
	`explanation` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_solutions`("id", "mystery_id", "player_id", "guess_who", "guess_how", "guess_why", "is_correct", "who_match", "how_match", "why_match", "hints_used", "gave_up", "explanation", "created_at") SELECT "id", "mystery_id", (SELECT "player_id" FROM "mysteries" WHERE "mysteries"."id" = "solutions"."mystery_id"), "guess_who", "guess_how", "guess_why", "is_correct", "who_match", "how_match", "why_match", "hints_used", "gave_up", "explanation", "created_at" FROM `solutions`;--> statement-breakpoint
DROP TABLE `solutions`;--> statement-breakpoint
ALTER TABLE `__new_solutions` RENAME TO `solutions`;--> statement-breakpoint
CREATE TABLE `__new_hints` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`player_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_hints`("id", "mystery_id", "player_id", "content", "created_at") SELECT "id", "mystery_id", (SELECT "player_id" FROM "mysteries" WHERE "mysteries"."id" = "hints"."mystery_id"), "content", "created_at" FROM `hints`;--> statement-breakpoint
DROP TABLE `hints`;--> statement-breakpoint
ALTER TABLE `__new_hints` RENAME TO `hints`;--> statement-breakpoint
CREATE INDEX `idx_mysteries_player` ON `mysteries` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mysteries_active` ON `mysteries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_clues_mystery` ON `clues` (`mystery_id`);--> statement-breakpoint
CREATE INDEX `idx_clues_mystery_player` ON `clues` (`mystery_id`,`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clues_mystery_annotation_uniq` ON `clues` (`mystery_id`,`player_id`,`annotation_id`) WHERE "clues"."annotation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `solutions_mystery_uniq` ON `solutions` (`mystery_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_hints_mystery_player` ON `hints` (`mystery_id`,`player_id`);
