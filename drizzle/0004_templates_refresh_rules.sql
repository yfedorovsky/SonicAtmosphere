CREATE TABLE "playlist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"mode" text,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" text NOT NULL,
	"cadence" text NOT NULL,
	"keep_percent" integer DEFAULT 60 NOT NULL,
	"artist_repeat_window" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playlist_templates" ADD CONSTRAINT "playlist_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_rules" ADD CONSTRAINT "refresh_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_rules" ADD CONSTRAINT "refresh_rules_draft_id_playlist_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."playlist_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_templates_user_id_idx" ON "playlist_templates" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_rules_draft_id_idx" ON "refresh_rules" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "refresh_rules_due_idx" ON "refresh_rules" USING btree ("enabled","next_run_at");