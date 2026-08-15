CREATE TYPE "public"."carry_forward_disposition" AS ENUM('invited', 'discarded');--> statement-breakpoint
CREATE TABLE "carry_forward" (
	"id" serial PRIMARY KEY NOT NULL,
	"conference_id" integer NOT NULL,
	"predecessor_submission_id" integer NOT NULL,
	"disposition" "carry_forward_disposition" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carry_forward" ADD CONSTRAINT "carry_forward_conference_id_conference_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carry_forward" ADD CONSTRAINT "carry_forward_predecessor_submission_id_submission_id_fk" FOREIGN KEY ("predecessor_submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carry_forward_unique" ON "carry_forward" USING btree ("conference_id","predecessor_submission_id");