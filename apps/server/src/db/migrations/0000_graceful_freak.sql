CREATE TABLE IF NOT EXISTS "clues" (
	"id" text PRIMARY KEY NOT NULL,
	"mystery_id" text NOT NULL,
	"player_id" text NOT NULL,
	"category_type" text NOT NULL,
	"content" text NOT NULL,
	"audio_timestamp_ms" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"annotation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clues_category_chk" CHECK ("clues"."category_type" IN ('character','item','location','event','note')),
	CONSTRAINT "clues_source_chk" CHECK ("clues"."source" IN ('manual','annotation'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hints" (
	"id" text PRIMARY KEY NOT NULL,
	"mystery_id" text NOT NULL,
	"player_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mysteries" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text,
	"category" text NOT NULL,
	"difficulty" text NOT NULL,
	"target_age_range" text,
	"status" text NOT NULL,
	"title" text,
	"logic_structure_json" jsonb,
	"narrative_text" text,
	"narrative_annotations" jsonb,
	"audio_path" text,
	"cover_image_path" text,
	"validation_passed" boolean,
	"validation_attempts" integer DEFAULT 0 NOT NULL,
	"validation_notes" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "mysteries_difficulty_chk" CHECK ("mysteries"."difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "mysteries_status_chk" CHECK ("mysteries"."status" IN ('pending','generating_logic','validating','writing','synthesizing','ready','failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_difficulty" text NOT NULL,
	"age_range" text DEFAULT '10-11' NOT NULL,
	"avatar_description" text,
	"avatar_image_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_difficulty_chk" CHECK ("players"."default_difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "players_age_range_chk" CHECK ("players"."age_range" IN ('8-9','10-11','12-13'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solutions" (
	"id" text PRIMARY KEY NOT NULL,
	"mystery_id" text NOT NULL,
	"player_id" text NOT NULL,
	"guess_who" text,
	"guess_how" text,
	"guess_why" text,
	"is_correct" boolean NOT NULL,
	"who_match" boolean,
	"how_match" boolean,
	"why_match" boolean,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"gave_up" boolean DEFAULT false NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clues" ADD CONSTRAINT "clues_mystery_id_mysteries_id_fk" FOREIGN KEY ("mystery_id") REFERENCES "public"."mysteries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clues" ADD CONSTRAINT "clues_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hints" ADD CONSTRAINT "hints_mystery_id_mysteries_id_fk" FOREIGN KEY ("mystery_id") REFERENCES "public"."mysteries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hints" ADD CONSTRAINT "hints_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mysteries" ADD CONSTRAINT "mysteries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solutions" ADD CONSTRAINT "solutions_mystery_id_mysteries_id_fk" FOREIGN KEY ("mystery_id") REFERENCES "public"."mysteries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solutions" ADD CONSTRAINT "solutions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clues_mystery" ON "clues" USING btree ("mystery_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clues_mystery_annotation_uniq" ON "clues" USING btree ("mystery_id","player_id","annotation_id") WHERE "clues"."annotation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clues_mystery_player" ON "clues" USING btree ("mystery_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hints_mystery_player" ON "hints" USING btree ("mystery_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mysteries_player" ON "mysteries" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mysteries_active" ON "mysteries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "solutions_mystery_uniq" ON "solutions" USING btree ("mystery_id","player_id");