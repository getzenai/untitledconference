/**
 * The review committee an organizer can actually assemble.
 *
 * The assertion that carries the feature is the last one: a membership written
 * here has to be the same thing `setReviewAssignment` accepts as eligible. Two
 * modules agreeing on a role string is exactly the kind of contract that
 * typechecks either way and only fails in the product.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setReviewAssignment } from './review-management';
import { addReviewRound } from './review-rounds';
import { addReviewer, committee, removeReviewer } from './reviewer-roster';

const suffix = `roster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const reviewerId = `rev-${suffix}`;
const reviewerEmail = `${reviewerId}@example.test`;
const otherId = `rev2-${suffix}`;
const otherEmail = `${otherId}@example.test`;

let conference: Conference;
let otherConference: Conference;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Roster Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{ id: reviewerId, email: reviewerEmail, emailVerified: true, name: 'Rex Reviewer' },
		{ id: otherId, email: otherEmail, emailVerified: true, name: 'Ines Reviewer' }
	]);

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Roster Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, reviewerId));
	await db.delete(user).where(eq(user.id, otherId));
});

describe('addReviewer', () => {
	it('puts an existing account on the committee', async () => {
		const result = await addReviewer(conference.id, reviewerEmail);
		expect(result).toEqual({ ok: true, name: 'Rex Reviewer' });

		const rows = await committee(conference.id);
		expect(rows.map((r) => r.email)).toEqual([reviewerEmail]);
	});

	it('refuses an address nobody signed up as, without writing a row', async () => {
		const before = (await committee(conference.id)).length;

		const result = await addReviewer(conference.id, `ghost-${suffix}@example.test`);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('no_account');

		expect(await committee(conference.id)).toHaveLength(before);
	});

	it('refuses the same person twice', async () => {
		const result = await addReviewer(conference.id, reviewerEmail);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('already');
		expect(await committee(conference.id)).toHaveLength(1);
	});

	it('keeps one conference’s committee out of another’s', async () => {
		await addReviewer(otherConference.id, otherEmail);

		expect((await committee(conference.id)).map((r) => r.email)).toEqual([reviewerEmail]);
		expect((await committee(otherConference.id)).map((r) => r.email)).toEqual([otherEmail]);
	});
});

describe('removeReviewer', () => {
	it('refuses a membership id belonging to another conference', async () => {
		const [theirs] = await committee(otherConference.id);

		expect(await removeReviewer(conference.id, theirs.membershipId)).toEqual({ ok: false });
		expect(await committee(otherConference.id)).toHaveLength(1);
	});
});

describe('the membership this writes is the one assignment accepts', () => {
	it('lets a freshly added reviewer be assigned to a submission', async () => {
		const round = await addReviewRound(conference.id, { name: 'Screening', anonymized: false });
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Assignable talk', status: 'submitted' })
			.returning({ id: submissionTable.id });

		const [member] = await committee(conference.id);

		// `setReviewAssignment` answers 'invalid' when the reviewer has no eligible
		// membership — which is precisely what every conference outside the demo seed
		// looked like before this module existed.
		const result = await setReviewAssignment(
			conference.id,
			submission.id,
			round.id,
			member.userId,
			true
		);

		expect(result).toBe('assigned');
	});
});
