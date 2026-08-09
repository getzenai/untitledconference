/**
 * The programme: where a talk sits in time and space.
 *
 * Implements section 6 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 */
import { relations, sql } from 'drizzle-orm';
import {
	index,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { submissionTable } from './cfp-schema';
import { conferenceDayTable, conferenceTable, roomTable } from './conference-schema';

/**
 * `session` = an accepted submission on the grid.
 * `block`   = a break or plenary with no submission behind it; a null room means it
 *             spans every room.
 * `reservation` = a slot held for a sponsor before anyone has submitted anything.
 */
export const placementKind = pgEnum('placement_kind', ['session', 'block', 'reservation']);

export const placementStatus = pgEnum('placement_status', ['tentative', 'confirmed']);

/**
 * One table covers four jobs (AGD-1/2): drafts parked on several slots, breaks,
 * reserved sponsor blocks, and publication — publishing is simply `status = confirmed`.
 *
 * Conflict is a function of the status pairing rather than a stored state:
 * confirmed x confirmed = warning, confirmed x tentative = hint, tentative x tentative
 * = nothing. AIA-04/05/06 are therefore queries, not columns.
 */
export const placementTable = pgTable(
	'placement',
	{
		id: serial('id').primaryKey(),
		conferenceId: integer('conference_id')
			.notNull()
			.references(() => conferenceTable.id, { onDelete: 'cascade' }),
		kind: placementKind('kind').notNull().default('session'),
		status: placementStatus('status').notNull().default('tentative'),
		/** Set for `kind = session`; null for blocks and reservations. */
		submissionId: integer('submission_id').references(() => submissionTable.id, {
			onDelete: 'cascade'
		}),
		/** Set for blocks and reservations, which have no submission to take a title from. */
		title: text('title'),
		conferenceDayId: integer('conference_day_id').references(() => conferenceDayTable.id, {
			onDelete: 'cascade'
		}),
		startsAt: timestamp('starts_at', { withTimezone: true }),
		endsAt: timestamp('ends_at', { withTimezone: true }),
		/** Null means "across all rooms" — used by breaks. */
		roomId: integer('room_id').references(() => roomTable.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		/**
		 * The invariant, enforced by Postgres rather than by discipline: at most one
		 * CONFIRMED placement per submission. Tentative drafts on several slots stay
		 * legal, which is the whole point of the tentative state.
		 *
		 * This is a partial unique index for a reason. AIA-06 drags sessions between
		 * slots repeatedly, and an application-level rule is exactly the kind that slips
		 * when nobody is looking. A constraint cannot be forgotten.
		 */
		uniqueIndex('placement_one_confirmed_per_submission')
			.on(t.submissionId)
			.where(sql`${t.status} = 'confirmed' and ${t.submissionId} is not null`),
		/** Overlap detection for the room and speaker conflict checks. */
		index('placement_slot_idx').on(t.conferenceDayId, t.roomId, t.startsAt, t.endsAt),
		index('placement_conference_status_idx').on(t.conferenceId, t.status)
	]
);

export const placementRelations = relations(placementTable, ({ one }) => ({
	conference: one(conferenceTable, {
		fields: [placementTable.conferenceId],
		references: [conferenceTable.id]
	}),
	submission: one(submissionTable, {
		fields: [placementTable.submissionId],
		references: [submissionTable.id]
	}),
	day: one(conferenceDayTable, {
		fields: [placementTable.conferenceDayId],
		references: [conferenceDayTable.id]
	}),
	room: one(roomTable, { fields: [placementTable.roomId], references: [roomTable.id] })
}));

export type Placement = typeof placementTable.$inferSelect;
export type NewPlacement = typeof placementTable.$inferInsert;
