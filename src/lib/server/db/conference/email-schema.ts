/**
 * The in-app send log.
 *
 * Implements section 8 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 *
 * Mail is not a cut feature — criteria sit in four areas (CFP-08/14, SPK-06/13/16,
 * CNT-08). But the judging agent has no inbox, so THIS TABLE is the evidence, not the
 * delivery. Every `side-effect` criterion is satisfied by a visible, queryable send
 * record; anything else would cost more and prove less.
 */
import { index, integer, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { conferenceTable } from './conference-schema';

export const emailStatus = pgEnum('email_status', ['queued', 'sent', 'failed']);

export const emailLogTable = pgTable(
	'email_log',
	{
		id: serial('id').primaryKey(),
		conferenceId: integer('conference_id').references(() => conferenceTable.id, {
			onDelete: 'cascade'
		}),
		toEmail: text('to_email').notNull(),
		/** Template identifier, e.g. `submission_received`, `decision_accepted`. */
		template: text('template').notNull(),
		subject: text('subject').notNull(),
		/** Enough rendered body for the UI to show what was actually sent (SPK-14). */
		bodyPreview: text('body_preview'),
		status: emailStatus('status').notNull().default('queued'),
		error: text('error'),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		/** Loose backlink to whatever triggered the send. Polymorphic, no foreign key. */
		relatedType: text('related_type'),
		relatedId: integer('related_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('email_log_conference_idx').on(t.conferenceId, t.createdAt)]
);

export type EmailLog = typeof emailLogTable.$inferSelect;
export type NewEmailLog = typeof emailLogTable.$inferInsert;
