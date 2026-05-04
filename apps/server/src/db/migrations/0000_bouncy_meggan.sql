CREATE TABLE `clues` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`category_type` text NOT NULL,
	`content` text NOT NULL,
	`audio_timestamp_ms` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "clues_category_chk" CHECK("clues"."category_type" IN ('character','item','location','event','note'))
);
--> statement-breakpoint
CREATE INDEX `idx_clues_mystery` ON `clues` (`mystery_id`);--> statement-breakpoint
CREATE TABLE `hints` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mysteries` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`category` text NOT NULL,
	`difficulty` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`logic_structure_json` text,
	`narrative_text` text,
	`audio_path` text,
	`validation_passed` integer,
	`validation_attempts` integer DEFAULT 0 NOT NULL,
	`validation_notes` text,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mysteries_difficulty_chk" CHECK("mysteries"."difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "mysteries_status_chk" CHECK("mysteries"."status" IN ('pending','generating_logic','validating','writing','synthesizing','ready','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_mysteries_player` ON `mysteries` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mysteries_active` ON `mysteries` (`status`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_difficulty` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "players_difficulty_chk" CHECK("players"."default_difficulty" IN ('easy','medium','hard'))
);
--> statement-breakpoint
CREATE TABLE `solutions` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
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
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solutions_mystery_uniq` ON `solutions` (`mystery_id`);