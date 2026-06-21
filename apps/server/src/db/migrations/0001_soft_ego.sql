CREATE TABLE IF NOT EXISTS "case_appearances" (
	"id" text PRIMARY KEY NOT NULL,
	"mystery_id" text NOT NULL,
	"character_id" text NOT NULL,
	"role_in_case" text NOT NULL,
	"is_culprit" boolean DEFAULT false NOT NULL,
	"motive" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_appearances_role_chk" CHECK ("case_appearances"."role_in_case" IN ('suspect','witness','bystander'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"traits" text,
	"portrait_image_path" text,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"image_path" text,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mysteries" ADD COLUMN "place_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_appearances" ADD CONSTRAINT "case_appearances_mystery_id_mysteries_id_fk" FOREIGN KEY ("mystery_id") REFERENCES "public"."mysteries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_appearances" ADD CONSTRAINT "case_appearances_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_appearances_mystery_char_uniq" ON "case_appearances" USING btree ("mystery_id","character_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_appearances_character" ON "case_appearances" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_appearances_mystery" ON "case_appearances" USING btree ("mystery_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mysteries" ADD CONSTRAINT "mysteries_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
