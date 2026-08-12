CREATE TABLE "crm_pipeline_card" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"speaker_profile_id" integer NOT NULL,
	"stage" text DEFAULT 'identified' NOT NULL,
	"notes" text,
	"score" integer,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stage_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "crm_pipeline_card" ADD CONSTRAINT "crm_pipeline_card_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_card" ADD CONSTRAINT "crm_pipeline_card_speaker_profile_id_speaker_profile_id_fk" FOREIGN KEY ("speaker_profile_id") REFERENCES "public"."speaker_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_history" ADD CONSTRAINT "crm_pipeline_stage_history_card_id_crm_pipeline_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."crm_pipeline_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_history" ADD CONSTRAINT "crm_pipeline_stage_history_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_card_org_profile_unique" ON "crm_pipeline_card" USING btree ("organization_id","speaker_profile_id");