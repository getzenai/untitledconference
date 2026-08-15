ALTER TYPE "public"."submission_status" ADD VALUE 'resubmit_with_guidance' BEFORE 'withdrawn';--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "resubmit_guidance" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "decline_note" text;