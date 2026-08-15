-- A note on an accept, not a status (#445). The talk stays `accepted` and
-- still takes its slot; these columns are the sentence the committee said
-- and who will chase it. Null is a clean accept.
ALTER TABLE "submission" ADD COLUMN "accept_condition" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "accept_condition_owner_id" text;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_accept_condition_owner_id_user_id_fk" FOREIGN KEY ("accept_condition_owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;