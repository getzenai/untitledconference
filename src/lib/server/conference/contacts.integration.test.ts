/**
 * Org-wide speaker CRM: directory, filters, notes, push-to-event (CRM-01/02/03/10).
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	createContact,
	getContact,
	importContacts,
	listContacts,
	pushContactToConference,
	updateContact
} from './contacts';
import { listConferenceSpeakers } from './speakers';

const suffix = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const outsiderId = `outsider-${suffix}`;
const slugA = `conf-a-${suffix}`;
const slugB = `conf-b-${suffix}`;

let conferenceAId: number;
let conferenceBId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'CRM Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'CRM Organizer'
		},
		{
			id: outsiderId,
			email: `${outsiderId}@example.test`,
			emailVerified: true,
			name: 'Outsider'
		}
	]);

	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	const conferences = await db
		.insert(conferenceTable)
		.values([
			{ organizationId, name: 'Summit A', slug: slugA },
			{ organizationId, name: 'Summit B', slug: slugB }
		])
		.returning();
	conferenceAId = conferences[0].id;
	conferenceBId = conferences[1].id;
});

beforeEach(async () => {
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conferenceAId));
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conferenceBId));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, outsiderId));
});

describe('listContacts (CRM-01)', () => {
	it('lists org-wide profiles with company, job title, email and linked events', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Ada Bennett',
			email: `ada-${suffix}@example.com`,
			company: 'Globex',
			jobTitle: 'Staff Engineer'
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await pushContactToConference(organizerId, created.speakerProfileId, slugA);

		const rows = await listContacts(organizerId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			name: 'Ada Bennett',
			company: 'Globex',
			jobTitle: 'Staff Engineer',
			email: `ada-${suffix}@example.com`
		});
		expect(rows[0].events.map((e) => e.slug)).toEqual([slugA]);
	});

	it('is empty for a user who does not administer any organization', async () => {
		await createContact(organizerId, organizationId, {
			name: 'Hidden',
			email: `hidden-${suffix}@example.com`
		});
		expect(await listContacts(outsiderId)).toEqual([]);
	});
});

describe('contact filters (CRM-02)', () => {
	it('narrows by company and job title and clears when filters are omitted', async () => {
		await createContact(organizerId, organizationId, {
			name: 'Priya',
			email: `priya-${suffix}@example.com`,
			company: 'Acme',
			jobTitle: 'CTO'
		});
		await createContact(organizerId, organizationId, {
			name: 'Sam',
			email: `sam-${suffix}@example.com`,
			company: 'Globex',
			jobTitle: 'Engineer'
		});

		const byCompany = await listContacts(organizerId, { company: 'Acme' });
		expect(byCompany.map((c) => c.name)).toEqual(['Priya']);

		const byTitle = await listContacts(organizerId, { jobTitle: 'Engineer' });
		expect(byTitle.map((c) => c.name)).toEqual(['Sam']);

		const all = await listContacts(organizerId, {});
		expect(all).toHaveLength(2);
	});

	it('filters by tag', async () => {
		const a = await createContact(organizerId, organizationId, {
			name: 'Tagged',
			email: `tag-${suffix}@example.com`,
			tags: 'keynote, vip'
		});
		await createContact(organizerId, organizationId, {
			name: 'Plain',
			email: `plain-${suffix}@example.com`
		});
		expect(a.ok).toBe(true);

		const filtered = await listContacts(organizerId, { tag: 'keynote' });
		expect(filtered.map((c) => c.name)).toEqual(['Tagged']);
	});
});

describe('contact detail (CRM-03 / CRM-04)', () => {
	it('persists internal notes and tags, and shows linked events', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Notes Person',
			email: `notes-${suffix}@example.com`
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const saved = await updateContact(organizerId, created.speakerProfileId, {
			name: 'Notes Person',
			notes: 'Follow up after Q3.',
			tags: 'alumni, vip'
		});
		expect(saved).toEqual({ ok: true, speakerProfileId: created.speakerProfileId });

		await pushContactToConference(organizerId, created.speakerProfileId, slugB);

		const detail = await getContact(organizerId, created.speakerProfileId);
		expect(detail).toMatchObject({
			notes: 'Follow up after Q3.',
			tags: ['alumni', 'vip']
		});
		expect(detail?.events.map((e) => e.slug)).toEqual([slugB]);
	});
});

describe('importContacts (CRM-05)', () => {
	it('bulk-imports rows into the directory', async () => {
		const result = await importContacts(organizerId, organizationId, [
			{
				line: 2,
				name: 'CSV One',
				email: `csv1-${suffix}@example.com`,
				jobTitle: 'Dev',
				company: 'ImportCo',
				bio: null,
				notes: null,
				status: null
			},
			{
				line: 3,
				name: 'CSV Two',
				email: `csv2-${suffix}@example.com`,
				jobTitle: null,
				company: null,
				bio: null,
				notes: null,
				status: null
			}
		]);
		expect(result).toEqual({ ok: true, added: 2, skipped: [] });

		const names = (await listContacts(organizerId)).map((c) => c.name).sort();
		expect(names).toEqual(['CSV One', 'CSV Two']);
	});

	it('skips duplicate emails on re-import', async () => {
		const row = {
			line: 2,
			name: 'Dup',
			email: `dup-${suffix}@example.com`,
			jobTitle: null,
			company: null,
			bio: null,
			notes: null,
			status: null
		};
		await importContacts(organizerId, organizationId, [row]);
		const second = await importContacts(organizerId, organizationId, [row]);
		expect(second).toEqual({ ok: true, added: 0, skipped: ['Dup'] });
	});
});

describe('pushContactToConference (CRM-10)', () => {
	it('puts the contact on the event roster with profile data intact', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Push Target',
			email: `push-${suffix}@example.com`,
			company: 'PushCo',
			jobTitle: 'Speaker'
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const pushed = await pushContactToConference(
			organizerId,
			created.speakerProfileId,
			slugA,
			'confirmed'
		);
		expect(pushed.ok).toBe(true);

		const roster = await listConferenceSpeakers(conferenceAId);
		expect(roster).toHaveLength(1);
		expect(roster[0]).toMatchObject({
			speakerProfileId: created.speakerProfileId,
			name: 'Push Target',
			company: 'PushCo',
			jobTitle: 'Speaker',
			status: 'confirmed'
		});

		const again = await pushContactToConference(organizerId, created.speakerProfileId, slugA);
		expect(again).toMatchObject({ ok: false, reason: 'already_on_roster' });
	});
});
