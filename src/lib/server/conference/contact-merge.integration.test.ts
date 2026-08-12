/**
 * Near-duplicate detect + merge (CRM-06).
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
import { findNameDuplicates, mergeContacts, normalizeContactName } from './contact-merge';
import { createContact, getContact, listContacts, pushContactToConference } from './contacts';

const suffix = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const slug = `conf-${suffix}`;
let conferenceId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Dup Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: organizerId,
		email: `${organizerId}@example.test`,
		emailVerified: true,
		name: 'Dup Organizer'
	});
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});
	const [conf] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Dup Conf', slug })
		.returning();
	conferenceId = conf.id;
});

beforeEach(async () => {
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conferenceId));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
});

describe('normalizeContactName', () => {
	it('collapses case and whitespace', () => {
		expect(normalizeContactName('  Priya   Raman ')).toBe('priya raman');
	});
});

describe('findNameDuplicates + mergeContacts (CRM-06)', () => {
	it('finds same-name different-email contacts and merges into primary', async () => {
		const primary = await createContact(organizerId, organizationId, {
			name: 'Priya Raman',
			email: `priya-${suffix}@example.com`,
			company: 'Acme',
			notes: 'Primary note'
		});
		const secondary = await createContact(organizerId, organizationId, {
			name: 'Priya Raman',
			email: `priya.alt-${suffix}@example.com`,
			jobTitle: 'CTO',
			notes: 'Alt note'
		});
		expect(primary.ok && secondary.ok).toBe(true);
		if (!primary.ok || !secondary.ok) return;

		await pushContactToConference(organizerId, secondary.speakerProfileId, slug);

		const dups = await findNameDuplicates(organizerId, primary.speakerProfileId);
		expect(dups.map((d) => d.id)).toEqual([secondary.speakerProfileId]);
		expect(dups[0].email).toBe(`priya.alt-${suffix}@example.com`);

		const beforeCount = (await listContacts(organizerId)).length;
		expect(beforeCount).toBe(2);

		const merged = await mergeContacts(
			organizerId,
			primary.speakerProfileId,
			secondary.speakerProfileId
		);
		expect(merged).toEqual({ ok: true, primaryId: primary.speakerProfileId });

		const after = await listContacts(organizerId);
		expect(after).toHaveLength(1);
		expect(after[0].id).toBe(primary.speakerProfileId);
		expect(after[0].jobTitle).toBe('CTO'); // filled from secondary
		expect(after[0].company).toBe('Acme');
		expect(after[0].events.map((e) => e.slug)).toEqual([slug]);

		const detail = await getContact(organizerId, primary.speakerProfileId);
		expect(detail?.notes).toContain('Primary note');
		expect(detail?.notes).toContain('Alt note');
		expect(await getContact(organizerId, secondary.speakerProfileId)).toBeNull();
	});

	it('rejects merge of a contact with itself', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Solo',
			email: `solo-${suffix}@example.com`
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		expect(
			await mergeContacts(organizerId, created.speakerProfileId, created.speakerProfileId)
		).toMatchObject({ ok: false, reason: 'invalid' });
	});
});
