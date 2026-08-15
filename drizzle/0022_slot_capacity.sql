-- The binding constraint on an acceptance call is arithmetic: "total slots 51,
-- accepted so far 33" (#444). Nobody could type the 51 until now.
--
-- Nullable on purpose, on both tables. Null is "nobody has said", not zero: a
-- conference without a number gets a count of what is accepted and no remainder.
ALTER TABLE "conference" ADD COLUMN "slot_capacity" integer;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "slot_capacity" integer;
