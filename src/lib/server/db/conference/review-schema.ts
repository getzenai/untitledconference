/**
 * Evaluation: rounds, scorecards, assignments and scores.
 *
 * Implements section 5 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 *
 * Rounds are in the schema from the start even though the UI opens with one.
 * ABS-01 asks literally for two or more independent rounds each with its own
 * scorecard, and retro-fitting that means touching `review` and every permission
 * check — the one thing not to be doing on Wednesday.
 */
import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from '../auth-schema';
import { submissionTable } from './cfp-schema';
import { conferenceTable } from './conference-schema';

/** ABS-03 grades all three types down to the stored value, so one numeric column is not enough. */
export const criterionKind = pgEnum('criterion_kind', ['rating', 'select', 'text']);

/**
 * ABS-05's queue only exists because a row is written at ASSIGNMENT time.
 * `recused` covers ABS-12 on the same row rather than needing a second column.
 */
export const reviewStatus = pgEnum('review_status', ['assigned', 'submitted', 'recused']);

export const evaluationPlanTable = pgTable('evaluation_plan', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const reviewRoundTable = pgTable('review_round', {
	id: serial('id').primaryKey(),
	evaluationPlanId: integer('evaluation_plan_id')
		.notNull()
		.references(() => evaluationPlanTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	opensAt: timestamp('opens_at', { withTimezone: true }),
	closesAt: timestamp('closes_at', { withTimezone: true }),
	/**
	 * ABS-07 word for word: "with anonymization enabled on a round". A flag on the
	 * round, not on the conference. When set, the reviewer view hides author and
	 * co-author identity while the organizer view of the same submission still shows it.
	 */
	anonymized: boolean('anonymized').notNull().default(false),
	position: integer('position').notNull().default(0)
});

export const scorecardCriterionTable = pgTable('scorecard_criterion', {
	id: serial('id').primaryKey(),
	reviewRoundId: integer('review_round_id')
		.notNull()
		.references(() => reviewRoundTable.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	kind: criterionKind('kind').notNull().default('rating'),
	/** Only meaningful for `rating`. */
	scaleMax: integer('scale_max'),
	/** Choices for `select`, as a JSON array of strings. */
	options: text('options'),
	/** ABS-04: the aggregate must reflect the weighting. */
	weight: numeric('weight', { precision: 6, scale: 2 }).notNull().default('1'),
	position: integer('position').notNull().default(0)
});

/**
 * One row per (round, submission, reviewer) — written when the organizer ASSIGNS,
 * not when the reviewer saves.
 *
 * That distinction is the whole point: without a row for "assigned but not yet done"
 * there is no queue for ABS-05, no completion count for ABS-08, no outstanding-reviews
 * set for ABS-09, and nothing for ABS-06 to distribute.
 *
 * Invariant the application must uphold: a reviewer is never assigned their own
 * submission (`reviewerUserId` must not be a speaker on `submissionId`).
 */
export const reviewTable = pgTable(
	'review',
	{
		id: serial('id').primaryKey(),
		reviewRoundId: integer('review_round_id')
			.notNull()
			.references(() => reviewRoundTable.id, { onDelete: 'cascade' }),
		submissionId: integer('submission_id')
			.notNull()
			.references(() => submissionTable.id, { onDelete: 'cascade' }),
		reviewerUserId: text('reviewer_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: reviewStatus('status').notNull().default('assigned'),
		/** Internal to organizers and reviewers — a speaker never sees this. */
		comment: text('comment'),
		assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
		submittedAt: timestamp('submitted_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('review_unique').on(t.reviewRoundId, t.submissionId, t.reviewerUserId),
		/** The reviewer's queue (ABS-05) and the progress dashboard (ABS-08). */
		index('review_reviewer_idx').on(t.reviewerUserId, t.reviewRoundId, t.status)
	]
);

export const reviewScoreTable = pgTable(
	'review_score',
	{
		id: serial('id').primaryKey(),
		reviewId: integer('review_id')
			.notNull()
			.references(() => reviewTable.id, { onDelete: 'cascade' }),
		scorecardCriterionId: integer('scorecard_criterion_id')
			.notNull()
			.references(() => scorecardCriterionTable.id, { onDelete: 'cascade' }),
		/** Set for `rating`; the weighted aggregate (ABS-04, ABS-10) reads this column. */
		valueNumber: numeric('value_number', { precision: 8, scale: 2 }),
		/** Set for `select` and `text`. */
		valueText: text('value_text')
	},
	(t) => [uniqueIndex('review_score_unique').on(t.reviewId, t.scorecardCriterionId)]
);

export const reviewRelations = relations(reviewTable, ({ one, many }) => ({
	round: one(reviewRoundTable, {
		fields: [reviewTable.reviewRoundId],
		references: [reviewRoundTable.id]
	}),
	submission: one(submissionTable, {
		fields: [reviewTable.submissionId],
		references: [submissionTable.id]
	}),
	scores: many(reviewScoreTable)
}));

export const reviewRoundRelations = relations(reviewRoundTable, ({ one, many }) => ({
	plan: one(evaluationPlanTable, {
		fields: [reviewRoundTable.evaluationPlanId],
		references: [evaluationPlanTable.id]
	}),
	criteria: many(scorecardCriterionTable),
	reviews: many(reviewTable)
}));

export type EvaluationPlan = typeof evaluationPlanTable.$inferSelect;
export type NewEvaluationPlan = typeof evaluationPlanTable.$inferInsert;
export type ReviewRound = typeof reviewRoundTable.$inferSelect;
export type NewReviewRound = typeof reviewRoundTable.$inferInsert;
export type ScorecardCriterion = typeof scorecardCriterionTable.$inferSelect;
export type NewScorecardCriterion = typeof scorecardCriterionTable.$inferInsert;
export type Review = typeof reviewTable.$inferSelect;
export type NewReview = typeof reviewTable.$inferInsert;
export type ReviewScore = typeof reviewScoreTable.$inferSelect;
export type NewReviewScore = typeof reviewScoreTable.$inferInsert;
