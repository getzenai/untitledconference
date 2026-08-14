/**
 * Assigning, changing and clearing a sponsor marker, and the CRUD the select
 * hangs off (#434).
 *
 * The column has been readable for a long time. These tests are the claim that
 * an organizer can now write it — and that a neighbour conference's tier, or
 * a delete while talks still carry it, cannot.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	sponsorTierTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	addSponsorTier,
	removeSponsorTier,
	setSubmissionSponsorTier,
	sponsorTiers,
	updateSponsorTier
} from './sponsor-tiers';

const suffix = `spon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let other: Conference;
let submissionId: number;
let otherSubmissionId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Sponsor Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Sponsor Conf', slug: suffix })
		.returning();
	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();
});

beforeEach(async () => {
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, other.id));
	await db.delete(sponsorTierTable).where(eq(sponsorTierTable.conferenceId, conference.id));
	await db.delete(sponsorTierTable).where(eq(sponsorTierTable.conferenceId, other.id));

	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId: conference.id, title: 'A sponsored talk', status: 'submitted' })
		.returning();
	submissionId = submission.id;

	const [foreign] = await db
		.insert(submissionTable)
		.values({ conferenceId: other.id, title: 'Their talk', status: 'submitted' })
		.returning();
	otherSubmissionId = foreign.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

const markedAs = async (id: number) => {
	const [row] = await db
		.select({ sponsorTierId: submissionTable.sponsorTierId })
		.from(submissionTable)
		.where(eq(submissionTable.id, id));
	return row.sponsorTierId;
};

describe('sponsor tier CRUD', () => {
	it('appends each new tier after the ones already there', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', 'paid keynote');
		const silver = await addSponsorTier(conference.id, 'Silver', null);

		expect(gold).toMatchObject({ ok: true });
		expect(silver).toMatchObject({ ok: true });

		expect(await sponsorTiers(conference.id)).toEqual([
			{ id: (gold as { id: number }).id, name: 'Gold', note: 'paid keynote', position: 0 },
			{ id: (silver as { id: number }).id, name: 'Silver', note: null, position: 1 }
		]);
	});

	it('refuses a second tier with the same name, case-insensitive', async () => {
		await addSponsorTier(conference.id, 'Gold', null);
		const again = await addSponsorTier(conference.id, 'gold', 'duplicate');

		expect(again).toEqual({
			ok: false,
			problem: 'There is already a sponsor tier called "gold".'
		});
		expect(await sponsorTiers(conference.id)).toHaveLength(1);
	});

	it('renames, notes and reorders a row without moving its id', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		if (!gold.ok) throw new Error('expected add');

		expect(await updateSponsorTier(conference.id, gold.id, 'Platinum', 'headline', 3)).toBeNull();

		expect(await sponsorTiers(conference.id)).toEqual([
			{ id: gold.id, name: 'Platinum', note: 'headline', position: 3 }
		]);
	});

	it('will not remove a tier a submission still carries', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		if (!gold.ok) throw new Error('expected add');
		await setSubmissionSponsorTier(conference.id, submissionId, gold.id);

		expect(await removeSponsorTier(conference.id, gold.id)).toMatch(/1 submission is marked/);
		expect(await sponsorTiers(conference.id)).toHaveLength(1);
		expect(await markedAs(submissionId)).toBe(gold.id);
	});

	it('removes a tier nobody is using', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		if (!gold.ok) throw new Error('expected add');

		expect(await removeSponsorTier(conference.id, gold.id)).toBeNull();
		expect(await sponsorTiers(conference.id)).toEqual([]);
	});

	it('will not edit or remove a neighbour conference’s tier by id', async () => {
		const theirs = await addSponsorTier(other.id, 'Gold', null);
		if (!theirs.ok) throw new Error('expected add');

		expect(await updateSponsorTier(conference.id, theirs.id, 'Stolen', null, 0)).toBe(
			'That sponsor tier is gone.'
		);
		expect(await removeSponsorTier(conference.id, theirs.id)).toBe('That sponsor tier is gone.');
		expect(await sponsorTiers(other.id)).toHaveLength(1);
	});
});

describe('assigning a sponsor tier on a submission', () => {
	it('assigns, changes and clears the marker', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		const silver = await addSponsorTier(conference.id, 'Silver', null);
		if (!gold.ok || !silver.ok) throw new Error('expected add');

		expect(await setSubmissionSponsorTier(conference.id, submissionId, gold.id)).toEqual({
			ok: true,
			changed: true
		});
		expect(await markedAs(submissionId)).toBe(gold.id);

		expect(await setSubmissionSponsorTier(conference.id, submissionId, silver.id)).toEqual({
			ok: true,
			changed: true
		});
		expect(await markedAs(submissionId)).toBe(silver.id);

		expect(await setSubmissionSponsorTier(conference.id, submissionId, null)).toEqual({
			ok: true,
			changed: true
		});
		expect(await markedAs(submissionId)).toBeNull();
	});

	it('is a no-op when the talk already carries that tier', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		if (!gold.ok) throw new Error('expected add');
		await setSubmissionSponsorTier(conference.id, submissionId, gold.id);

		expect(await setSubmissionSponsorTier(conference.id, submissionId, gold.id)).toEqual({
			ok: true,
			changed: false
		});
	});

	it('refuses a neighbour conference’s tier', async () => {
		const theirs = await addSponsorTier(other.id, 'Gold', null);
		if (!theirs.ok) throw new Error('expected add');

		expect(await setSubmissionSponsorTier(conference.id, submissionId, theirs.id)).toEqual({
			ok: false,
			reason: 'invalid_tier'
		});
		expect(await markedAs(submissionId)).toBeNull();
	});

	it('will not write a neighbour conference’s submission', async () => {
		const gold = await addSponsorTier(conference.id, 'Gold', null);
		if (!gold.ok) throw new Error('expected add');

		expect(await setSubmissionSponsorTier(conference.id, otherSubmissionId, gold.id)).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(await markedAs(otherSubmissionId)).toBeNull();
	});
});
