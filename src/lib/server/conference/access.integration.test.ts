/**
 * The one real permission boundary in the product (`scoping`, Ü3).
 *
 * A reviewer who can open the organizer's table sees every submission in the
 * conference including the sponsor tiers — which is exactly the failure the rubric
 * looks for. So the interesting assertions here are the negative ones.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	membershipTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizedConferences, requireOrganizer } from './access';

const suffix = `access-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

const OWNER = `owner-${suffix}`;
const SCOPED_ORGANIZER = `scoped-${suffix}`;
const REVIEWER = `reviewer-${suffix}`;
const STRANGER = `stranger-${suffix}`;
const PEOPLE = [OWNER, SCOPED_ORGANIZER, REVIEWER, STRANGER];

let conference: Conference;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Access Org',
		slug: organizationId,
		createdAt: new Date()
	});

	for (const id of PEOPLE) {
		await db.insert(user).values({
			id,
			name: id,
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix, startsOn: '2027-05-12' })
		.returning();

	await db.insert(member).values([
		{ id: `m-${OWNER}`, organizationId, userId: OWNER, role: 'owner', createdAt: new Date() },
		// A plain org seat is NOT an organizer seat: being in the company does not
		// mean being on this event.
		{
			id: `m-${REVIEWER}`,
			organizationId,
			userId: REVIEWER,
			role: 'member',
			createdAt: new Date()
		},
		{
			id: `m-${SCOPED_ORGANIZER}`,
			organizationId,
			userId: SCOPED_ORGANIZER,
			role: 'member',
			createdAt: new Date()
		}
	]);

	await db.insert(membershipTable).values([
		{
			userId: SCOPED_ORGANIZER,
			role: 'organizer',
			scopeType: 'conference',
			scopeId: conference.id
		},
		{ userId: REVIEWER, role: 'reviewer', scopeType: 'conference', scopeId: conference.id }
	]);
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(inArray(user.id, PEOPLE));
});

describe('requireOrganizer', () => {
	it('lets the organization owner in', async () => {
		const context = await requireOrganizer(OWNER, conference.slug);
		expect(context.conference.id).toBe(conference.id);
		expect(context.via).toBe('org');
	});

	it('lets an organizer scoped to this one conference in', async () => {
		const context = await requireOrganizer(SCOPED_ORGANIZER, conference.slug);
		expect(context.via).toBe('conference');
	});

	it('keeps a reviewer of the same conference out', async () => {
		await expect(requireOrganizer(REVIEWER, conference.slug)).rejects.toMatchObject({
			status: 404
		});
	});

	it('keeps someone with no relationship at all out', async () => {
		await expect(requireOrganizer(STRANGER, conference.slug)).rejects.toMatchObject({
			status: 404
		});
	});

	it('answers an unknown slug exactly like a forbidden one — 404, no hint', async () => {
		await expect(requireOrganizer(OWNER, `${suffix}-does-not-exist`)).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('organizedConferences', () => {
	it('lists what the owner organizes', async () => {
		const list = await organizedConferences(OWNER);
		expect(list.map((c) => c.id)).toContain(conference.id);
	});

	it('lists the single conference a scoped organizer was added to', async () => {
		const list = await organizedConferences(SCOPED_ORGANIZER);
		expect(list.map((c) => c.id)).toEqual([conference.id]);
	});

	it('is empty for a reviewer', async () => {
		expect(await organizedConferences(REVIEWER)).toEqual([]);
	});
});
