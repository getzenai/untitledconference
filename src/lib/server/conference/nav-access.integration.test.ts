/**
 * The sidebar flags against a real database (#239).
 *
 * The interesting assertions are the negative ones and the two that would be easy to
 * conflate: a plain org seat is not an organizer seat, and a scoped conference
 * organizer is not a contacts organizer. Both are why this is a query and not a
 * single "is staff" boolean.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	membershipTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { evaluationPlanTable, reviewRoundTable } from '$lib/server/db/conference/review-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { navAccess } from './nav-access';

const suffix = `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

const OWNER = `owner-${suffix}`;
const EMPTY_OWNER = `empty-owner-${suffix}`;
const SCOPED_ORGANIZER = `scoped-${suffix}`;
const ROUND_REVIEWER = `round-reviewer-${suffix}`;
const SPEAKER = `speaker-${suffix}`;
const CLAIMED_SPEAKER = `claimed-${suffix}`;
const INVITED_SPEAKER = `invited-${suffix}`;
const PEOPLE = [
	OWNER,
	EMPTY_OWNER,
	SCOPED_ORGANIZER,
	ROUND_REVIEWER,
	SPEAKER,
	CLAIMED_SPEAKER,
	INVITED_SPEAKER
];

const emptyOrganizationId = `org-empty-${suffix}`;

let conference: Conference;
let roundId: number;

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: organizationId, name: 'Nav Org', slug: organizationId, createdAt: new Date() },
		{
			id: emptyOrganizationId,
			name: 'Nav Org Without Conferences',
			slug: emptyOrganizationId,
			createdAt: new Date()
		}
	]);

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

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId: conference.id, name: 'Plan' })
		.returning();

	[{ id: roundId }] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Round 1', position: 1 })
		.returning({ id: reviewRoundTable.id });

	await db.insert(member).values([
		{ id: `m-${OWNER}`, organizationId, userId: OWNER, role: 'owner', createdAt: new Date() },
		{
			id: `m-${EMPTY_OWNER}`,
			organizationId: emptyOrganizationId,
			userId: EMPTY_OWNER,
			role: 'owner',
			createdAt: new Date()
		},
		// Being in the company is not being on the event: plain `member` seats must
		// not open Conferences or Contacts.
		{
			id: `m-${SCOPED_ORGANIZER}`,
			organizationId,
			userId: SCOPED_ORGANIZER,
			role: 'member',
			createdAt: new Date()
		},
		{
			id: `m-${ROUND_REVIEWER}`,
			organizationId,
			userId: ROUND_REVIEWER,
			role: 'member',
			createdAt: new Date()
		},
		{
			id: `m-${SPEAKER}`,
			organizationId,
			userId: SPEAKER,
			role: 'member',
			createdAt: new Date()
		}
	]);

	// One claimed profile, and one an organizer created for an address that has
	// not opened the portal yet (userId null) — the pre-claim case the menu
	// entry must already cover (#248).
	await db.insert(speakerProfileTable).values([
		{
			organizationId,
			userId: CLAIMED_SPEAKER,
			name: 'Claimed Speaker',
			sortName: 'claimed'
		},
		{
			organizationId,
			userId: null,
			email: `${INVITED_SPEAKER}@example.com`,
			name: 'Invited Speaker',
			sortName: 'invited'
		}
	]);

	await db.insert(membershipTable).values([
		{
			userId: SCOPED_ORGANIZER,
			role: 'organizer',
			scopeType: 'conference',
			scopeId: conference.id
		},
		// Reviewer seats usually hang off a round, not a conference — the case a
		// conference-only lookup would miss.
		{ userId: ROUND_REVIEWER, role: 'reviewer', scopeType: 'round', scopeId: roundId }
	]);
});

afterAll(async () => {
	await db.delete(membershipTable).where(inArray(membershipTable.userId, PEOPLE));
	await db
		.delete(organization)
		.where(inArray(organization.id, [organizationId, emptyOrganizationId]));
	await db.delete(user).where(inArray(user.id, PEOPLE));
});

describe('navAccess', () => {
	it('gives a speaker with no seat nothing beyond Speaking', async () => {
		expect(await navAccess(SPEAKER, `${SPEAKER}@example.com`)).toEqual({
			conferences: false,
			contacts: false,
			reviewing: false,
			reviewSlug: null,
			speakerProfile: false,
			organization: true
		});
	});

	it('gives the organization owner both organizer surfaces', async () => {
		expect(await navAccess(OWNER, `${OWNER}@example.com`)).toEqual({
			conferences: true,
			contacts: true,
			reviewing: false,
			reviewSlug: null,
			speakerProfile: false,
			organization: true
		});
	});

	it('keeps Conferences for an owner who has not created one yet', async () => {
		// `/manage` is the only page carrying "New conference". A rule that counted
		// conferences would lock this user out of making their first.
		expect(await navAccess(EMPTY_OWNER, `${EMPTY_OWNER}@example.com`)).toMatchObject({
			conferences: true
		});
	});

	it('gives a scoped conference organizer Conferences but not Contacts', async () => {
		// The directory reads org-wide seats alone, so that link would open an empty
		// table for this user.
		expect(await navAccess(SCOPED_ORGANIZER, `${SCOPED_ORGANIZER}@example.com`)).toEqual({
			conferences: true,
			contacts: false,
			reviewing: false,
			reviewSlug: null,
			speakerProfile: false,
			organization: true
		});
	});

	it('sees a claimed speaker profile', async () => {
		expect(await navAccess(CLAIMED_SPEAKER, `${CLAIMED_SPEAKER}@example.com`)).toMatchObject({
			speakerProfile: true
		});
	});

	it('sees an unclaimed profile through the account email, and only that email', async () => {
		// The organizer typed the address; the person never opened the portal.
		// The menu entry is how they find it — so the check must match pre-claim.
		expect(await navAccess(INVITED_SPEAKER, `${INVITED_SPEAKER}@example.com`)).toMatchObject({
			speakerProfile: true
		});
		// Somebody else's unclaimed profile is not yours, and no email means no match.
		expect(await navAccess(SPEAKER, null)).toMatchObject({ speakerProfile: false });
	});

	it('finds a reviewer whose seat is scoped to a round', async () => {
		expect(await navAccess(ROUND_REVIEWER, `${ROUND_REVIEWER}@example.com`)).toEqual({
			conferences: false,
			contacts: false,
			reviewing: true,
			reviewSlug: conference.slug,
			speakerProfile: false,
			organization: true
		});
	});

	it('does not name a conference when the reviewer sits on two', async () => {
		// The sidebar would otherwise have to pick one. Two seats keep `/review`,
		// which is the list — the 303 is only for a list of one (#373).
		const TWO = `two-${suffix}`;
		await db.insert(user).values({
			id: TWO,
			name: TWO,
			email: `${TWO}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		const [other] = await db
			.insert(conferenceTable)
			.values({
				organizationId,
				name: 'Other Conf',
				slug: `other-${suffix}`,
				startsOn: '2027-09-01'
			})
			.returning();
		await db.insert(membershipTable).values([
			{ userId: TWO, role: 'reviewer', scopeType: 'round', scopeId: roundId },
			{ userId: TWO, role: 'reviewer', scopeType: 'conference', scopeId: other.id }
		]);

		expect(await navAccess(TWO, `${TWO}@example.com`)).toEqual({
			conferences: false,
			contacts: false,
			reviewing: true,
			reviewSlug: null,
			speakerProfile: false,
			// No seat in any organization — this one would be offered the locked
			// organizer entries and the form that opens them (#439).
			organization: false
		});

		await db.delete(membershipTable).where(inArray(membershipTable.userId, [TWO]));
		await db.delete(conferenceTable).where(eq(conferenceTable.id, other.id));
		await db.delete(user).where(eq(user.id, TWO));
	});
});
