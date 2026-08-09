CREATE TYPE "public"."cfp_form_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."content_approval" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."form_field_kind" AS ENUM('short_text', 'long_text', 'select', 'file', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'in_review', 'accepted', 'rejected', 'waitlisted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."conference_speaker_status" AS ENUM('invited', 'confirmed', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conference_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('organizer', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."membership_scope" AS ENUM('conference', 'round');--> statement-breakpoint
CREATE TYPE "public"."deliverable_approval" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."revision_entity" AS ENUM('submission', 'speaker_profile');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('action', 'file_request');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'submitted', 'done');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."placement_kind" AS ENUM('session', 'block', 'reservation');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('tentative', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."criterion_kind" AS ENUM('rating', 'select', 'text');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('assigned', 'submitted', 'recused');--> statement-breakpoint
CREATE TABLE "cfp_form" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"title" text NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"status" "cfp_form_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_field" (
	"id" serial PRIMARY KEY NOT NULL,
	"cfp_form_id" integer NOT NULL,
	"label" text NOT NULL,
	"kind" "form_field_kind" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"options" text,
	"condition_field_id" integer,
	"condition_value" text
);
--> statement-breakpoint
CREATE TABLE "submission_answer" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"form_field_id" integer NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "submission_speaker" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"speaker_profile_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"role_label" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"cfp_form_id" integer,
	"track_id" integer,
	"session_format_id" integer,
	"title" text NOT NULL,
	"abstract" text,
	"key_takeaway" text,
	"audience_level" text,
	"sponsor_tier_id" integer,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"content_approval" "content_approval" DEFAULT 'approved' NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_day" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"date" date NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_speaker" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"speaker_profile_id" integer NOT NULL,
	"status" "conference_speaker_status" DEFAULT 'invited' NOT NULL,
	"logistics" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"venue" text,
	"starts_on" date,
	"ends_on" date,
	"cfp_intro" text,
	"status" "conference_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"scope_type" "membership_scope" NOT NULL,
	"scope_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_track" (
	"id" serial PRIMARY KEY NOT NULL,
	"membership_id" integer NOT NULL,
	"track_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_format" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"name" text NOT NULL,
	"minutes" integer,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text,
	"headshot_url" text,
	"job_title" text,
	"company" text,
	"bio" text,
	"links" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_tier" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "revision_entity" NOT NULL,
	"entity_id" integer NOT NULL,
	"snapshot" text NOT NULL,
	"edited_by" text,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"file_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"approval_status" "deliverable_approval" DEFAULT 'pending' NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"deliverable_id" integer NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"speaker_profile_id" integer NOT NULL,
	"submission_id" integer,
	"template_id" integer,
	"title" text NOT NULL,
	"instructions" text,
	"kind" "task_kind" DEFAULT 'action' NOT NULL,
	"due_on" timestamp with time zone,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"kind" "task_kind" DEFAULT 'action' NOT NULL,
	"due_offset_days" integer,
	"due_on" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"body_preview" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"related_type" text,
	"related_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"kind" "placement_kind" DEFAULT 'session' NOT NULL,
	"status" "placement_status" DEFAULT 'tentative' NOT NULL,
	"submission_id" integer,
	"title" text,
	"conference_day_id" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"room_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_round" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluation_plan_id" integer NOT NULL,
	"name" text NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"anonymized" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_score" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"scorecard_criterion_id" integer NOT NULL,
	"value_number" numeric(8, 2),
	"value_text" text
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_round_id" integer NOT NULL,
	"submission_id" integer NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"status" "review_status" DEFAULT 'assigned' NOT NULL,
	"comment" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scorecard_criterion" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_round_id" integer NOT NULL,
	"label" text NOT NULL,
	"kind" "criterion_kind" DEFAULT 'rating' NOT NULL,
	"scale_max" integer,
	"options" text,
	"weight" numeric(6, 2) DEFAULT '1' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cfp_form" ADD CONSTRAINT "cfp_form_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_cfp_form_id_cfp_form_id_fk" FOREIGN KEY ("cfp_form_id") REFERENCES "public"."cfp_form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_condition_field_id_form_field_id_fk" FOREIGN KEY ("condition_field_id") REFERENCES "public"."form_field"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_form_field_id_form_field_id_fk" FOREIGN KEY ("form_field_id") REFERENCES "public"."form_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_speaker" ADD CONSTRAINT "submission_speaker_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_speaker" ADD CONSTRAINT "submission_speaker_speaker_profile_id_speaker_profile_id_fk" FOREIGN KEY ("speaker_profile_id") REFERENCES "public"."speaker_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_cfp_form_id_cfp_form_id_fk" FOREIGN KEY ("cfp_form_id") REFERENCES "public"."cfp_form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_session_format_id_session_format_id_fk" FOREIGN KEY ("session_format_id") REFERENCES "public"."session_format"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_sponsor_tier_id_sponsor_tier_id_fk" FOREIGN KEY ("sponsor_tier_id") REFERENCES "public"."sponsor_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_day" ADD CONSTRAINT "conference_day_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_speaker" ADD CONSTRAINT "conference_speaker_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_speaker" ADD CONSTRAINT "conference_speaker_speaker_profile_id_speaker_profile_id_fk" FOREIGN KEY ("speaker_profile_id") REFERENCES "public"."speaker_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference" ADD CONSTRAINT "conference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_track" ADD CONSTRAINT "membership_track_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_track" ADD CONSTRAINT "membership_track_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_format" ADD CONSTRAINT "session_format_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profile" ADD CONSTRAINT "speaker_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profile" ADD CONSTRAINT "speaker_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_tier" ADD CONSTRAINT "sponsor_tier_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_speaker_profile_id_speaker_profile_id_fk" FOREIGN KEY ("speaker_profile_id") REFERENCES "public"."speaker_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_template_id_task_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_template" ADD CONSTRAINT "task_template_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_conference_day_id_conference_day_id_fk" FOREIGN KEY ("conference_day_id") REFERENCES "public"."conference_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_plan" ADD CONSTRAINT "evaluation_plan_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_round" ADD CONSTRAINT "review_round_evaluation_plan_id_evaluation_plan_id_fk" FOREIGN KEY ("evaluation_plan_id") REFERENCES "public"."evaluation_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_score" ADD CONSTRAINT "review_score_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_score" ADD CONSTRAINT "review_score_scorecard_criterion_id_scorecard_criterion_id_fk" FOREIGN KEY ("scorecard_criterion_id") REFERENCES "public"."scorecard_criterion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_criterion" ADD CONSTRAINT "scorecard_criterion_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_answer_unique" ON "submission_answer" USING btree ("submission_id","form_field_id");--> statement-breakpoint
CREATE INDEX "submission_answer_field_idx" ON "submission_answer" USING btree ("form_field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_speaker_unique" ON "submission_speaker" USING btree ("submission_id","speaker_profile_id");--> statement-breakpoint
CREATE INDEX "submission_conference_status_idx" ON "submission" USING btree ("conference_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "conference_speaker_unique" ON "conference_speaker" USING btree ("conference_id","speaker_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_track_unique" ON "membership_track" USING btree ("membership_id","track_id");--> statement-breakpoint
CREATE INDEX "content_revision_entity_idx" ON "content_revision" USING btree ("entity_type","entity_id","edited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_version_unique" ON "deliverable" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "file_comment_deliverable_idx" ON "file_comment" USING btree ("deliverable_id","created_at");--> statement-breakpoint
CREATE INDEX "task_speaker_idx" ON "task" USING btree ("speaker_profile_id","status");--> statement-breakpoint
CREATE INDEX "task_conference_due_idx" ON "task" USING btree ("conference_id","due_on");--> statement-breakpoint
CREATE INDEX "email_log_conference_idx" ON "email_log" USING btree ("conference_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_one_confirmed_per_submission" ON "placement" USING btree ("submission_id") WHERE "placement"."status" = 'confirmed' and "placement"."submission_id" is not null;--> statement-breakpoint
CREATE INDEX "placement_slot_idx" ON "placement" USING btree ("conference_day_id","room_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "placement_conference_status_idx" ON "placement" USING btree ("conference_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_score_unique" ON "review_score" USING btree ("review_id","scorecard_criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_unique" ON "review" USING btree ("review_round_id","submission_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_reviewer_idx" ON "review" USING btree ("reviewer_user_id","review_round_id","status");