ALTER TABLE "conference" ADD COLUMN "listed_publicly" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- The flag is off by default so a new conference joins the front-page directory
-- only when someone says so (#402). Everything already published was already in
-- that directory, and shipping this must not empty it — so today's listing is
-- carried over verbatim, and the choice starts applying to what comes next.
UPDATE "conference" SET "listed_publicly" = true WHERE "status" = 'published';
