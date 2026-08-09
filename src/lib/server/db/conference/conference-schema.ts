/**
 * Conference master data, people and scoped roles.
 *
 * Implements sections 1 and 2 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 *
 * Naming rule for the whole feature: a talk is NEVER called `session` in the schema.
 * Better Auth already owns a `session` table for login sessions. A talk is a
 * `submission` (what was proposed) plus a `placement` (where it sits in the programme).
 */
import { relations } from 'drizzle-orm';
import {
	date,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { organization, user } from '../auth-schema';

export const conferenceStatus = pgEnum('conference_status', ['draft', 'published', 'archived']);

/**
 * How much of each other's work reviewers see.
 *
 * `open` is the default and the state the product already had: a programme committee
 * argues, and arguing needs to see the argument. `blind_until_reviewed` withholds
 * peers' scores and comments until the reviewer has filed their own, which removes the
 * anchoring effect without removing the discussion afterwards.
 *
 * Two modes, deliberately. The spectrum of blindness in the literature is real and a
 * settings screen with six radio buttons is a research project, not a product.
 */
export const reviewVisibility = pgEnum('review_visibility', ['open', 'blind_until_reviewed']);

/** Scoped roles beyond Better Auth's org-wide owner/admin/member. */
export const membershipRole = pgEnum('membership_role', ['organizer', 'reviewer']);

/**
 * What a membership is scoped to. Generic on purpose: ABS-02 requires a reviewer pool
 * per review round, so a reviewer in round 1 is not automatically one in round 2.
 */
export const membershipScope = pgEnum('membership_scope', ['conference', 'round']);

/** SPK-04: a filterable workflow status, per conference rather than per profile. */
export const conferenceSpeakerStatus = pgEnum('conference_speaker_status', [
	'invited',
	'confirmed',
	'declined',
	'cancelled'
]);

export const conferenceTable = pgTable('conference', {
	id: serial('id').primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
	venue: text('venue'),
	startsOn: date('starts_on'),
	endsOn: date('ends_on'),
	/** Free text shown above the public submission form (CFP-03). */
	cfpIntro: text('cfp_intro'),
	status: conferenceStatus('status').notNull().default('draft'),
	/** ABS-07's setting, per conference — see `reviewVisibility`. */
	reviewVisibility: reviewVisibility('review_visibility').notNull().default('open'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export const trackTable = pgTable('track', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	position: integer('position').notNull().default(0)
});

/** Public-facing axis: Keynote, Talk, Lightning Talk, Workshop, Panel (SPO-1). */
export const sessionFormatTable = pgTable('session_format', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	minutes: integer('minutes'),
	position: integer('position').notNull().default(0)
});

/**
 * INTERNAL axis, deliberately separate from sessionFormat (SPO-1).
 * Nothing carrying a sponsor tier may appear in any public output or reviewer view.
 */
export const sponsorTierTable = pgTable('sponsor_tier', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	note: text('note'),
	position: integer('position').notNull().default(0)
});

export const roomTable = pgTable('room', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	position: integer('position').notNull().default(0)
});

export const conferenceDayTable = pgTable('conference_day', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	date: date('date').notNull(),
	position: integer('position').notNull().default(0)
});

/**
 * Org-wide speaker record. This is simultaneously the cross-event speaker directory
 * of CRM-01 and the source for EMB-01/04/12, which check headshot, job title and
 * company literally — those three columns are not optional polish.
 *
 * `userId` is nullable: an organizer can add a speaker who has no account yet.
 */
export const speakerProfileTable = pgTable('speaker_profile', {
	id: serial('id').primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	/**
	 * Sort key for the alphabetical-by-surname ordering EMB-04 and EMB-12 require.
	 *
	 * A stored column rather than something derived from `name` at read time: "van der
	 * Berg" and "Ng Wei Ling" defeat every rule that splits a display name on spaces,
	 * and the same person must sort identically on all five public surfaces. Whoever
	 * writes the profile decides the sort key; nothing downstream guesses.
	 */
	sortName: text('sort_name').notNull(),
	email: text('email'),
	headshotUrl: text('headshot_url'),
	jobTitle: text('job_title'),
	company: text('company'),
	bio: text('bio'),
	/** Social/profile links as `[{ label, url }]` (SPK-08). */
	links: text('links'),
	/** CRM-03: persistent internal notes, never shown publicly. */
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/**
 * A speaker's participation in one conference. Carries the workflow status (SPK-04)
 * that must NOT live on the org-wide profile — the same person can confirm for one
 * event and decline the next.
 *
 * Inserting a row here is also the CRM-10 handoff: pushing a contact from the
 * org-wide database into a specific event is an insert, not a copy.
 */
export const conferenceSpeakerTable = pgTable(
	'conference_speaker',
	{
		id: serial('id').primaryKey(),
		conferenceId: integer('conference_id')
			.notNull()
			.references(() => conferenceTable.id, { onDelete: 'cascade' }),
		speakerProfileId: integer('speaker_profile_id')
			.notNull()
			.references(() => speakerProfileTable.id, { onDelete: 'cascade' }),
		status: conferenceSpeakerStatus('status').notNull().default('invited'),
		/** SPK-15: travel preferences and other per-event logistics. */
		logistics: text('logistics'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('conference_speaker_unique').on(t.conferenceId, t.speakerProfileId)]
);

/**
 * Scoped role assignment. `membership` says who MAY READ; `review` (review-schema.ts)
 * says who SHOULD DO WHAT. Two different questions, two different tables.
 *
 * `scopeId` is polymorphic — it points at `conference.id` or `review_round.id`
 * depending on `scopeType` — so Postgres cannot enforce it with a foreign key.
 * Deleting a round therefore leaves orphan rows that the application must clean up.
 */
export const membershipTable = pgTable('membership', {
	id: serial('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	role: membershipRole('role').notNull(),
	scopeType: membershipScope('scope_type').notNull(),
	scopeId: integer('scope_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** Optionally narrows a reviewer membership to specific tracks (ABS-06). */
export const membershipTrackTable = pgTable(
	'membership_track',
	{
		id: serial('id').primaryKey(),
		membershipId: integer('membership_id')
			.notNull()
			.references(() => membershipTable.id, { onDelete: 'cascade' }),
		trackId: integer('track_id')
			.notNull()
			.references(() => trackTable.id, { onDelete: 'cascade' })
	},
	(t) => [uniqueIndex('membership_track_unique').on(t.membershipId, t.trackId)]
);

export const conferenceRelations = relations(conferenceTable, ({ many }) => ({
	tracks: many(trackTable),
	sessionFormats: many(sessionFormatTable),
	rooms: many(roomTable),
	days: many(conferenceDayTable),
	speakers: many(conferenceSpeakerTable)
}));

export const speakerProfileRelations = relations(speakerProfileTable, ({ many }) => ({
	conferences: many(conferenceSpeakerTable)
}));

export type Conference = typeof conferenceTable.$inferSelect;
export type NewConference = typeof conferenceTable.$inferInsert;
export type Track = typeof trackTable.$inferSelect;
export type NewTrack = typeof trackTable.$inferInsert;
export type SessionFormat = typeof sessionFormatTable.$inferSelect;
export type NewSessionFormat = typeof sessionFormatTable.$inferInsert;
export type SponsorTier = typeof sponsorTierTable.$inferSelect;
export type NewSponsorTier = typeof sponsorTierTable.$inferInsert;
export type Room = typeof roomTable.$inferSelect;
export type NewRoom = typeof roomTable.$inferInsert;
export type ConferenceDay = typeof conferenceDayTable.$inferSelect;
export type NewConferenceDay = typeof conferenceDayTable.$inferInsert;
export type SpeakerProfile = typeof speakerProfileTable.$inferSelect;
export type NewSpeakerProfile = typeof speakerProfileTable.$inferInsert;
export type ConferenceSpeaker = typeof conferenceSpeakerTable.$inferSelect;
export type NewConferenceSpeaker = typeof conferenceSpeakerTable.$inferInsert;
export type Membership = typeof membershipTable.$inferSelect;
export type NewMembership = typeof membershipTable.$inferInsert;
export type MembershipTrack = typeof membershipTrackTable.$inferSelect;
export type NewMembershipTrack = typeof membershipTrackTable.$inferInsert;
