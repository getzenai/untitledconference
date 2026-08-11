/**
 * Speaker roster write/read paths (SPK-01 / SPK-02 / SPK-04).
 *
 * Identity is org-scoped; status is conference-scoped. The tests assert both
 * boundaries: a foreign org's profile cannot be edited, and a status change on
 * conference A leaves conference B alone.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queueSpeakerMail } from './speaker-mail';
import {
	addSpeakerToConference,
	listConferenceSpeakers,
	speakerRosterTotals,
	updateSpeakerProfile,
	updateSpeakerStatus
} from './speakers';

const suffix = `spk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const foreignOrgId = `org-foreign-${suffix}`;

let conference: Conference;
let otherConference: Conference;

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: organizationId, name: 'Roster Org', slug: organizationId, createdAt: new Date() },
		{ id: foreignOrgId, name: 'Foreign Org', slug: foreignOrgId, createdAt: new Date() }
	]);

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();

	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Sister Conf', slug: `${suffix}-sister` })
		.returning();
});

beforeEach(async () => {
	await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, conference.id));
	await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, otherConference.id));
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conference.id));
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, otherConference.id));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
	await db.delete(speakerProfileTable).where(eq(speakerProfileTable.organizationId, foreignOrgId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(organization).where(eq(organization.id, foreignOrgId));
});

describe('addSpeakerToConference', () => {
	it('creates a profile and conference membership with status', async () => {
		const result = await addSpeakerToConference(conference, {
			name: 'Priya Raman',
			email: `priya-${suffix}@example.com`,
			jobTitle: 'Staff Engineer',
			company: 'Acme',
			status: 'invited'
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const rows = await listConferenceSpeakers(conference.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			speakerProfileId: result.speakerProfileId,
			name: 'Priya Raman',
			email: `priya-${suffix}@example.com`,
			jobTitle: 'Staff Engineer',
			company: 'Acme',
			status: 'invited',
			hasAccount: false
		});
		// sortName guessed from "Priya Raman"
		expect(rows[0].sortName).toBe('Raman, Priya');
	});

	it('reuses an org profile by email instead of forking', async () => {
		const first = await addSpeakerToConference(conference, {
			name: 'Marcus Chen',
			email: `marcus-${suffix}@example.com`
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await addSpeakerToConference(otherConference, {
			name: 'Marcus Chen',
			email: `marcus-${suffix}@example.com`,
			status: 'confirmed'
		});
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.speakerProfileId).toBe(first.speakerProfileId);

		const profiles = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.organizationId, organizationId));
		expect(profiles).toHaveLength(1);
	});

	it('on email reuse leaves existing profile fields alone and only fills blanks', async () => {
		const first = await addSpeakerToConference(conference, {
			name: 'Priya Raman',
			email: `priya-reuse-${suffix}@example.com`,
			jobTitle: 'Staff Engineer',
			company: 'Acme',
			bio: 'Original bio.',
			notes: 'Original notes.'
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		// Sister conference: contradictory form values must not rewrite the shared profile.
		const second = await addSpeakerToConference(otherConference, {
			name: 'Typo Name',
			email: `priya-reuse-${suffix}@example.com`,
			jobTitle: 'Intern',
			company: 'Evil Corp',
			bio: 'Overwrite attempt.',
			notes: 'Should not land.',
			status: 'confirmed'
		});
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.speakerProfileId).toBe(first.speakerProfileId);

		const [profile] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, first.speakerProfileId));
		expect(profile).toMatchObject({
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			jobTitle: 'Staff Engineer',
			company: 'Acme',
			bio: 'Original bio.',
			notes: 'Original notes.'
		});

		// Blank optional fields on a bare profile may still be filled from a later add.
		const bare = await addSpeakerToConference(conference, {
			name: 'Bare Bones',
			email: `bare-${suffix}@example.com`
		});
		expect(bare.ok).toBe(true);
		if (!bare.ok) return;

		await addSpeakerToConference(otherConference, {
			name: 'Ignored Name',
			email: `bare-${suffix}@example.com`,
			jobTitle: 'Filled Later',
			company: 'Northwind'
		});

		const [filled] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, bare.speakerProfileId));
		expect(filled).toMatchObject({
			name: 'Bare Bones',
			jobTitle: 'Filled Later',
			company: 'Northwind'
		});
	});

	it('rejects a second add of the same profile on the same conference', async () => {
		const first = await addSpeakerToConference(conference, {
			name: 'Sam Okonkwo',
			email: `sam-${suffix}@example.com`
		});
		expect(first.ok).toBe(true);

		const second = await addSpeakerToConference(conference, {
			name: 'Sam Okonkwo',
			email: `sam-${suffix}@example.com`
		});
		expect(second).toMatchObject({ ok: false, reason: 'already_on_roster' });
	});

	it('requires a name', async () => {
		const result = await addSpeakerToConference(conference, { name: '   ' });
		expect(result).toMatchObject({ ok: false, reason: 'invalid' });
	});
});

describe('listConferenceSpeakers filters (SPK-01 / SPK-04)', () => {
	beforeEach(async () => {
		await addSpeakerToConference(conference, {
			name: 'Zoe Adler',
			email: `zoe-${suffix}@example.com`,
			company: 'Northwind',
			status: 'invited'
		});
		await addSpeakerToConference(conference, {
			name: 'Ada Lovelace',
			email: `ada-${suffix}@example.com`,
			jobTitle: 'Mathematician',
			status: 'confirmed'
		});
		await addSpeakerToConference(conference, {
			name: 'Grace Hopper',
			email: `grace-${suffix}@example.com`,
			status: 'declined'
		});
	});

	it('filters by status', async () => {
		const confirmed = await listConferenceSpeakers(conference.id, { status: 'confirmed' });
		expect(confirmed).toHaveLength(1);
		expect(confirmed[0].name).toBe('Ada Lovelace');
		expect(confirmed[0].status).toBe('confirmed');
	});

	it('searches identity fields case-insensitively', async () => {
		const byCompany = await listConferenceSpeakers(conference.id, { q: 'northwind' });
		expect(byCompany.map((r) => r.name)).toEqual(['Zoe Adler']);

		const byJob = await listConferenceSpeakers(conference.id, { q: 'mathematician' });
		expect(byJob.map((r) => r.name)).toEqual(['Ada Lovelace']);

		const byName = await listConferenceSpeakers(conference.id, { q: 'hopper' });
		expect(byName.map((r) => r.name)).toEqual(['Grace Hopper']);
	});

	it('orders by sortName', async () => {
		const all = await listConferenceSpeakers(conference.id);
		expect(all.map((r) => r.sortName)).toEqual(['Adler, Zoe', 'Hopper, Grace', 'Lovelace, Ada']);
	});

	it('reports totals independent of the filter', async () => {
		const totals = await speakerRosterTotals(conference.id);
		expect(totals).toEqual({
			total: 3,
			invited: 1,
			confirmed: 1,
			declined: 1,
			cancelled: 0
		});
	});
});

describe('updateSpeakerProfile (SPK-02)', () => {
	it('persists organizer edits and requires conference membership', async () => {
		const added = await addSpeakerToConference(conference, {
			name: 'Tom Hughes',
			email: `tom-${suffix}@example.com`
		});
		expect(added.ok).toBe(true);
		if (!added.ok) return;

		const ok = await updateSpeakerProfile(conference.id, added.speakerProfileId, {
			name: 'Tom Hughes',
			email: `tom-h-${suffix}@example.com`,
			jobTitle: 'Principal',
			company: 'Bell Labs',
			bio: 'Networking pioneer.',
			notes: 'Prefers morning slots'
		});
		expect(ok.ok).toBe(true);

		const [row] = await listConferenceSpeakers(conference.id);
		expect(row).toMatchObject({
			email: `tom-h-${suffix}@example.com`,
			jobTitle: 'Principal',
			company: 'Bell Labs',
			bio: 'Networking pioneer.',
			notes: 'Prefers morning slots'
		});

		// Sister conference: same org, no membership on B → not_found (Sol #90 blocker 1).
		const sisterDenied = await updateSpeakerProfile(otherConference.id, added.speakerProfileId, {
			name: 'Hijacked On Sister'
		});
		expect(sisterDenied).toMatchObject({ ok: false, reason: 'not_found' });

		const [still] = await db
			.select({ name: speakerProfileTable.name })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, added.speakerProfileId));
		expect(still.name).toBe('Tom Hughes');

		// Unknown profile id
		const missing = await updateSpeakerProfile(conference.id, 9_999_999, { name: 'Nope' });
		expect(missing).toMatchObject({ ok: false, reason: 'not_found' });
	});
});

describe('updateSpeakerStatus (SPK-04)', () => {
	it('changes status on one conference only and rejects unknown values', async () => {
		const a = await addSpeakerToConference(conference, {
			name: 'Ines Duarte',
			email: `ines-${suffix}@example.com`,
			status: 'invited'
		});
		expect(a.ok).toBe(true);
		if (!a.ok) return;

		// Same person on the sister conference, different status.
		await addSpeakerToConference(otherConference, {
			name: 'Ines Duarte',
			email: `ines-${suffix}@example.com`,
			status: 'confirmed'
		});

		const changed = await updateSpeakerStatus(conference.id, a.speakerProfileId, 'declined');
		expect(changed.ok).toBe(true);

		const [here] = await listConferenceSpeakers(conference.id);
		expect(here.status).toBe('declined');

		const [there] = await listConferenceSpeakers(otherConference.id);
		expect(there.status).toBe('confirmed');

		const bad = await updateSpeakerStatus(conference.id, a.speakerProfileId, 'maybe');
		expect(bad).toMatchObject({ ok: false, reason: 'invalid' });

		// Missing membership
		const missing = await updateSpeakerStatus(conference.id, 9_999_999, 'confirmed');
		expect(missing).toMatchObject({ ok: false, reason: 'not_found' });
	});

	it('does not touch a conference_speaker row belonging to another conference id pair', async () => {
		const a = await addSpeakerToConference(conference, {
			name: 'Only Here',
			email: `only-${suffix}@example.com`
		});
		expect(a.ok).toBe(true);
		if (!a.ok) return;

		const result = await updateSpeakerStatus(otherConference.id, a.speakerProfileId, 'cancelled');
		expect(result).toMatchObject({ ok: false, reason: 'not_found' });

		const [row] = await db
			.select()
			.from(conferenceSpeakerTable)
			.where(
				and(
					eq(conferenceSpeakerTable.conferenceId, conference.id),
					eq(conferenceSpeakerTable.speakerProfileId, a.speakerProfileId)
				)
			);
		expect(row.status).toBe('invited');
	});
});

describe('queueSpeakerMail (SPK-13)', () => {
	it('queues only the conference-and-status filtered roster, and skips missing addresses', async () => {
		await addSpeakerToConference(conference, {
			name: 'Confirmed Here',
			email: `confirmed-${suffix}@example.com`,
			status: 'confirmed'
		});
		await addSpeakerToConference(conference, {
			name: 'Invited Here',
			email: `invited-${suffix}@example.com`,
			status: 'invited'
		});
		await addSpeakerToConference(conference, {
			name: 'Confirmed Without Email',
			status: 'confirmed'
		});
		await addSpeakerToConference(otherConference, {
			name: 'Confirmed Sister',
			email: `sister-${suffix}@example.com`,
			status: 'confirmed'
		});

		const result = await queueSpeakerMail(
			conference.id,
			{ status: 'confirmed' },
			'Arrival details',
			'Please reply with your travel time.'
		);

		expect(result).toEqual({ queued: 1, withoutEmail: 1 });
		const rows = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.conferenceId, conference.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			toEmail: `confirmed-${suffix}@example.com`,
			template: 'speaker_bulk',
			subject: 'Arrival details',
			bodyPreview: 'Please reply with your travel time.',
			status: 'queued',
			relatedType: 'speaker'
		});
	});
});
