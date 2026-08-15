/**
 * Call for Papers: the configurable form, and what comes back through it.
 *
 * Implements sections 3 and 4 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 */
import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { user } from '../auth-schema';
import {
	conferenceTable,
	sessionFormatTable,
	speakerProfileTable,
	sponsorTierTable,
	trackTable
} from './conference-schema';

export const cfpFormStatus = pgEnum('cfp_form_status', ['draft', 'published', 'closed']);

/** CFP-01 requires at least short text, long text and dropdown to be configurable. */
export const formFieldKind = pgEnum('form_field_kind', [
	'short_text',
	'long_text',
	'select',
	'file',
	'boolean'
]);

export const submissionStatus = pgEnum('submission_status', [
	'draft',
	'submitted',
	'in_review',
	'accepted',
	'rejected',
	'waitlisted',
	'withdrawn'
]);

/**
 * CNT-12's gate. Lives on the submission, not the deliverable: a talk with no files
 * at all must still carry a status the organizer can set.
 *
 * The default is `approved` on purpose. With `pending` as the default the public
 * agenda would be empty after the golden path (accept -> schedule -> publish) until
 * someone approved every talk individually, which costs EMB-06 and everything behind
 * it. The criterion tests a state CHANGE — the gate exists to withhold, not to unlock.
 *
 * Everything except `approved` is excluded from public output: "unapproved" includes
 * `pending`, it does not mean `rejected`.
 */
export const contentApproval = pgEnum('content_approval', ['approved', 'pending', 'rejected']);

/**
 * Where an accepted talk sits in the editorial loop (#446). Named, not
 * computed — a file on disk is not a stand. Null means the organizer has
 * not started tracking. The talk stays `accepted` either way.
 */
export const editorialStand = pgEnum('editorial_stand', [
	'materials_requested',
	'received',
	'reviewed',
	'revision_requested',
	'final'
]);

export const cfpFormTable = pgTable('cfp_form', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	/**
	 * What a submitter needs to know before they start: what the programme is
	 * looking for, whether reviews are anonymous. Travel and admission coverage
	 * live on `speakerSupport` — this box is the rest.
	 *
	 * A column rather than fixed copy because none of that is true of conferences
	 * in general — it is true of one conference, and only its organizer knows it.
	 * Plain text: paragraphs separated by a blank line, lines starting with `-`
	 * become bullets (see `$lib/conference/prose`). Not markdown — this is public,
	 * organizer-authored text, and a real renderer is a much larger surface than
	 * the two shapes the page actually needs.
	 */
	description: text('description'),
	opensAt: timestamp('opens_at', { withTimezone: true }),
	/** CFP-04 and CFP-16: the public portal closes and editing locks once this passes. */
	closesAt: timestamp('closes_at', { withTimezone: true }),
	/**
	 * Which of the form's built-in questions this call does NOT ask (#159), as a
	 * JSON array of keys from `$lib/conference/fixed-questions`.
	 *
	 * The removals rather than the inclusions, so that null — every row written
	 * before #159, and every row a future column default forgets about — means
	 * "asks all of them", which is what those calls do. Storing the inclusions
	 * would make an empty value mean an empty form, and the migration would have
	 * to guess for every existing conference.
	 *
	 * Not a join table: these are not rows anywhere else, they are named controls
	 * in one component, and a table would invite a foreign key to a field that
	 * only exists in the markup.
	 */
	hiddenFixedFields: text('hidden_fixed_fields'),
	/**
	 * Structured answer to "do you cover my flight?" (#512), as JSON.
	 *
	 * Null means the call says nothing — not "not covered". A default of
	 * "not covered" would invent a promise the organizer never made.
	 * Parsed only by `$lib/conference/speaker-support`.
	 */
	speakerSupport: text('speaker_support'),
	status: cfpFormStatus('status').notNull().default('draft'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * What a field's visibility condition is measured against (CFP-02).
 *
 * The criterion names the session format and the track explicitly — and those are
 * columns on the submission, not answers to configurable fields, so a condition that
 * could only point at another `form_field` would miss exactly the case being graded.
 * `field` keeps the original ability to depend on another answer.
 */
export const conditionSource = pgEnum('form_field_condition_source', [
	'field',
	'session_format',
	'track'
]);

/**
 * A configurable field on the submission form.
 *
 * `conditionSource` / `conditionFieldId` / `conditionValue` implement CFP-02: show
 * this field only when the chosen format, track or another answer holds a given
 * value. Self-referencing, so it is declared with an explicit callback type.
 */
export const formFieldTable = pgTable('form_field', {
	id: serial('id').primaryKey(),
	cfpFormId: integer('cfp_form_id')
		.notNull()
		.references(() => cfpFormTable.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	kind: formFieldKind('kind').notNull(),
	required: boolean('required').notNull().default(false),
	position: integer('position').notNull().default(0),
	/** Choices for `select`, as a JSON array of strings. */
	options: text('options'),
	/** Null means the field is always shown. */
	conditionSource: conditionSource('condition_source'),
	/** Only for `conditionSource = 'field'`. */
	conditionFieldId: integer('condition_field_id').references((): AnyPgColumn => formFieldTable.id, {
		onDelete: 'set null'
	}),
	/** The answer, session format id or track id the condition is satisfied by. */
	conditionValue: text('condition_value')
});

export const submissionTable = pgTable(
	'submission',
	{
		id: serial('id').primaryKey(),
		conferenceId: integer('conference_id')
			.notNull()
			.references(() => conferenceTable.id, { onDelete: 'cascade' }),
		cfpFormId: integer('cfp_form_id').references(() => cfpFormTable.id, { onDelete: 'set null' }),
		trackId: integer('track_id').references(() => trackTable.id, { onDelete: 'set null' }),
		sessionFormatId: integer('session_format_id').references(() => sessionFormatTable.id, {
			onDelete: 'set null'
		}),
		/**
		 * Only `title` is required. CFP-07 asks for a draft that can be saved with as
		 * little as a title and resumed later, so everything else stays nullable.
		 */
		title: text('title').notNull(),
		abstract: text('abstract'),
		keyTakeaway: text('key_takeaway'),
		audienceLevel: text('audience_level'),
		/** INTERNAL — must never leave the organizer's views. */
		sponsorTierId: integer('sponsor_tier_id').references(() => sponsorTierTable.id, {
			onDelete: 'set null'
		}),
		status: submissionStatus('status').notNull().default('draft'),
		/**
		 * A note on an accept, not a status (#445). "Accepted if you bring a
		 * co-presenter" is still `accepted`: it takes a slot, it grows the
		 * speaker tasks, it sits in the programme. The text is what the
		 * committee actually decided; the owner is who will chase it. Null
		 * is a clean accept, or a talk that was never accepted.
		 */
		acceptCondition: text('accept_condition'),
		acceptConditionOwnerId: text('accept_condition_owner_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		/**
		 * The editorial stand on an accept, not a status (#446). Null is an
		 * accepted talk the organizer has not started tracking. `final` is
		 * done. The slot, the speaker tasks and the programme do not move.
		 */
		editorialStand: editorialStand('editorial_stand'),
		contentApproval: contentApproval('content_approval').notNull().default('approved'),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [index('submission_conference_status_idx').on(t.conferenceId, t.status)]
);

/** Answers to the configurable fields. Indexed by field for the per-field answer count. */
export const submissionAnswerTable = pgTable(
	'submission_answer',
	{
		id: serial('id').primaryKey(),
		submissionId: integer('submission_id')
			.notNull()
			.references(() => submissionTable.id, { onDelete: 'cascade' }),
		formFieldId: integer('form_field_id')
			.notNull()
			.references(() => formFieldTable.id, { onDelete: 'cascade' }),
		value: text('value')
	},
	(t) => [
		uniqueIndex('submission_answer_unique').on(t.submissionId, t.formFieldId),
		/**
		 * FRM-1: the form freezes on its first answer, so the editor needs answers-per-field.
		 * Counted, not stored — this index is what makes counting cheap.
		 */
		index('submission_answer_field_idx').on(t.formFieldId)
	]
);

/**
 * Co-presenters are required, not a nicety: EMB-01 and EMB-09 want the COMPLETE
 * speaker list with job title and company on the talk, and ABS-11 checks that
 * co-authors added at submission time survive into the organizer's views.
 */
export const submissionSpeakerTable = pgTable(
	'submission_speaker',
	{
		id: serial('id').primaryKey(),
		submissionId: integer('submission_id')
			.notNull()
			.references(() => submissionTable.id, { onDelete: 'cascade' }),
		speakerProfileId: integer('speaker_profile_id')
			.notNull()
			.references(() => speakerProfileTable.id, { onDelete: 'cascade' }),
		isPrimary: boolean('is_primary').notNull().default(false),
		/** ABS-11 checks that the role label persists. */
		roleLabel: text('role_label'),
		position: integer('position').notNull().default(0)
	},
	(t) => [uniqueIndex('submission_speaker_unique').on(t.submissionId, t.speakerProfileId)]
);

export const submissionRelations = relations(submissionTable, ({ one, many }) => ({
	conference: one(conferenceTable, {
		fields: [submissionTable.conferenceId],
		references: [conferenceTable.id]
	}),
	track: one(trackTable, { fields: [submissionTable.trackId], references: [trackTable.id] }),
	sessionFormat: one(sessionFormatTable, {
		fields: [submissionTable.sessionFormatId],
		references: [sessionFormatTable.id]
	}),
	speakers: many(submissionSpeakerTable),
	answers: many(submissionAnswerTable)
}));

export const submissionSpeakerRelations = relations(submissionSpeakerTable, ({ one }) => ({
	submission: one(submissionTable, {
		fields: [submissionSpeakerTable.submissionId],
		references: [submissionTable.id]
	}),
	speakerProfile: one(speakerProfileTable, {
		fields: [submissionSpeakerTable.speakerProfileId],
		references: [speakerProfileTable.id]
	})
}));

export type CfpForm = typeof cfpFormTable.$inferSelect;
export type NewCfpForm = typeof cfpFormTable.$inferInsert;
export type FormField = typeof formFieldTable.$inferSelect;
export type NewFormField = typeof formFieldTable.$inferInsert;
export type Submission = typeof submissionTable.$inferSelect;
export type NewSubmission = typeof submissionTable.$inferInsert;
export type SubmissionAnswer = typeof submissionAnswerTable.$inferSelect;
export type NewSubmissionAnswer = typeof submissionAnswerTable.$inferInsert;
export type SubmissionSpeaker = typeof submissionSpeakerTable.$inferSelect;
export type NewSubmissionSpeaker = typeof submissionSpeakerTable.$inferInsert;
