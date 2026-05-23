PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clues` (
	`id` text PRIMARY KEY NOT NULL,
	`mystery_id` text NOT NULL,
	`category_type` text NOT NULL,
	`content` text NOT NULL,
	`audio_timestamp_ms` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`annotation_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mystery_id`) REFERENCES `mysteries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "clues_category_chk" CHECK("__new_clues"."category_type" IN ('character','item','location','event','note')),
	CONSTRAINT "clues_source_chk" CHECK("__new_clues"."source" IN ('manual','annotation'))
);
--> statement-breakpoint
INSERT INTO `__new_clues`("id", "mystery_id", "category_type", "content", "audio_timestamp_ms", "source", "annotation_id", "created_at") SELECT "id", "mystery_id", "category_type", "content", "audio_timestamp_ms", 'manual', NULL, "created_at" FROM `clues`;--> statement-breakpoint
DROP TABLE `clues`;--> statement-breakpoint
ALTER TABLE `__new_clues` RENAME TO `clues`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_clues_mystery` ON `clues` (`mystery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clues_mystery_annotation_uniq` ON `clues` (`mystery_id`,`annotation_id`) WHERE "clues"."annotation_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `mysteries` ADD `narrative_annotations` text;