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
	boolean,
	date,
	foreignKey,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { organization, user } from '../auth-schema';

/**
 * The lifecycle of a conference — and, in `archived`, this product's delete.
 *
 * `archived` was declared here from the start and nothing ever reached it: no
 * writer set it, no reader filtered on it, only the status badge knew a colour
 * for it. It is wired up now because every public read already asks for
 * `status = 'published'`, which means an archived conference disappears from the
 * front door, the agenda, the speaker pages and the call for papers without a
 * single one of those queries changing. `statusBeforeArchive` remembers where it
 * came from so the step can be undone.
 */
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

export const conferenceTable = pgTable(
	'conference',
	{
		id: serial('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/**
		 * The public address of the conference, and the key every lookup uses.
		 *
		 * Unique across the whole table, not per organization: `access.ts` and
		 * `public-conference.ts` both resolve a bare slug with `limit(1)`, so a second
		 * conference claiming the same one would not collide — it would quietly
		 * shadow the first, and `/c/<slug>` would show one organization's event under
		 * another's link. Harmless while conferences only came from the seed;
		 * unacceptable now that organizers choose their own.
		 */
		slug: text('slug').notNull(),
		venue: text('venue'),
		startsOn: date('starts_on'),
		endsOn: date('ends_on'),
		/** Free text shown above the public submission form (CFP-03). */
		cfpIntro: text('cfp_intro'),
		status: conferenceStatus('status').notNull().default('draft'),
		/**
		 * What `status` was before it became `archived`, and null whenever it is not.
		 *
		 * Archiving is this product's delete, and a delete you can undo has to
		 * remember what it undid: without this column, restoring a conference that
		 * was live would have to guess between putting the public page back up and
		 * silently demoting it to a draft. It also tells the permanent delete apart
		 * from the reversible one — only a conference that was never published can
		 * be purged, and after archiving, `status` alone can no longer say whether
		 * it was.
		 */
		statusBeforeArchive: conferenceStatus('status_before_archive'),
		/**
		 * Whether the front-door directory names this conference (#402).
		 *
		 * Published and listed are two different questions, and until now one column
		 * answered both: `/` showed every conference with `status = 'published'`, so a
		 * test conference an agent published put its timestamp of a name next to the
		 * real ones on the page whose entire job is "this product is real".
		 *
		 * Off by default, so a new conference is published *to the people holding its
		 * link* and joins the directory only when someone says so. Existing published
		 * conferences were backfilled to `true` (migration 0020) — the flag is meant to
		 * change what happens next, not to empty the front door on the day it ships.
		 *
		 * Unlisting never hides the conference itself: `/c/<slug>`, the call for papers
		 * and the agenda all keep filtering on `status` alone.
		 */
		listedPublicly: boolean('listed_publicly').notNull().default(false),
		/**
		 * How many programme slots the conference has to give away (#444).
		 *
		 * The argument that decides an acceptance call is arithmetic — "total slots 51,
		 * accepted so far 33" — and nothing in the product knew the 51. It is a number a
		 * human types, not one we can derive: the agenda grid only exists once talks are
		 * placed, which is *after* the meeting that needs the count.
		 *
		 * Nullable, and null is not zero. A conference that has not said how many slots
		 * it has gets a count of what is accepted and no remainder — inventing "0 left"
		 * would stop a committee mid-call over a number we made up.
		 */
		slotCapacity: integer('slot_capacity'),
		/**
		 * The previous edition of this conference (#448).
		 *
		 * Recurring conferences are the norm, and without this column there is no
		 * fact that 2026 follows 2025 — only two rows that happen to share an
		 * organization. The near-miss invite lane (`carry_forward`) reads this
		 * pointer; the column itself transfers nothing.
		 *
		 * Directed and cycle-free: a conference names at most one predecessor, and
		 * walking the chain must not return to itself. Same organization only —
		 * the setter refuses a row from another org rather than leaking that it
		 * exists. Clearing is writing null. Deleting the previous edition (the
		 * rare hard delete) drops the pointer, not the conference that named it.
		 */
		predecessorConferenceId: integer('predecessor_conference_id'),
		/** ABS-07's setting, per conference — see `reviewVisibility`. */
		reviewVisibility: reviewVisibility('review_visibility').notNull().default('open'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('conference_slug_unique').on(t.slug),
		// Declared here rather than on the column: a `.references(() => conferenceTable.id)`
		// on the same table is a circular type and turns the whole row into `any`.
		foreignKey({
			columns: [t.predecessorConferenceId],
			foreignColumns: [t.id],
			name: 'conference_predecessor_conference_id_conference_id_fk'
		}).onDelete('set null')
	]
);

export const trackTable = pgTable('track', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	/**
	 * The track's share of the programme (#444). Same rule as the conference total:
	 * nullable, and null means "not said", not "none left".
	 */
	slotCapacity: integer('slot_capacity'),
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
	/**
	 * CRM-04: organizer-defined tags as a JSON string array, e.g. `["keynote","vip"]`.
	 * Text rather than jsonb so the same read/write path as `links` stays one style.
	 */
	tags: text('tags'),
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
 * CRM-07: org-wide speaker sourcing pipeline (kanban), above any single event.
 *
 * Stages are free text constrained in application code so we can rename labels
 * without a migration. One card per contact per org.
 */
export const crmPipelineCardTable = pgTable(
	'crm_pipeline_card',
	{
		id: serial('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		speakerProfileId: integer('speaker_profile_id')
			.notNull()
			.references(() => speakerProfileTable.id, { onDelete: 'cascade' }),
		/** researching | identified | contacted | interested | confirmed | declined */
		stage: text('stage').notNull().default('identified'),
		/** Card-scoped notes (CRM-08), separate from the profile's CRM-03 notes. */
		notes: text('notes'),
		score: integer('score'),
		rationale: text('rationale'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('crm_pipeline_card_org_profile_unique').on(t.organizationId, t.speakerProfileId)
	]
);

/**
 * CRM-08: timestamped stage transitions for a pipeline card.
 * `fromStage` is null on enrollment (first stage assignment).
 */
export const crmPipelineStageHistoryTable = pgTable('crm_pipeline_stage_history', {
	id: serial('id').primaryKey(),
	cardId: integer('card_id')
		.notNull()
		.references(() => crmPipelineCardTable.id, { onDelete: 'cascade' }),
	fromStage: text('from_stage'),
	toStage: text('to_stage').notNull(),
	changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
	changedByUserId: text('changed_by_user_id').references(() => user.id, { onDelete: 'set null' })
});

/**
 * CRM-09: named, reusable filter snapshots on the org directory.
 * Filters are JSON `{ q?, company?, jobTitle?, tag? }` — dynamic: reopening
 * re-runs the criteria against current contacts.
 */
export const crmSegmentTable = pgTable('crm_segment', {
	id: serial('id').primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	/** Serialized ContactFilters JSON. */
	filters: text('filters').notNull().default('{}'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

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

export const conferenceRelations = relations(conferenceTable, ({ many, one }) => ({
	tracks: many(trackTable),
	sessionFormats: many(sessionFormatTable),
	rooms: many(roomTable),
	days: many(conferenceDayTable),
	speakers: many(conferenceSpeakerTable),
	predecessor: one(conferenceTable, {
		fields: [conferenceTable.predecessorConferenceId],
		references: [conferenceTable.id],
		relationName: 'edition_chain'
	}),
	successors: many(conferenceTable, { relationName: 'edition_chain' })
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
export type CrmPipelineCard = typeof crmPipelineCardTable.$inferSelect;
export type NewCrmPipelineCard = typeof crmPipelineCardTable.$inferInsert;
export type CrmPipelineStageHistory = typeof crmPipelineStageHistoryTable.$inferSelect;
export type NewCrmPipelineStageHistory = typeof crmPipelineStageHistoryTable.$inferInsert;
export type CrmSegment = typeof crmSegmentTable.$inferSelect;
export type NewCrmSegment = typeof crmSegmentTable.$inferInsert;
export type Membership = typeof membershipTable.$inferSelect;
export type NewMembership = typeof membershipTable.$inferInsert;
export type MembershipTrack = typeof membershipTrackTable.$inferSelect;
export type NewMembershipTrack = typeof membershipTrackTable.$inferInsert;
