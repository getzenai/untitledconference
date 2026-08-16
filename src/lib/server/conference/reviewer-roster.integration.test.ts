/**
 * The review committee an organizer can actually assemble.
 *
 * The assertions that carry the feature check the contract in both directions:
 * a membership written here has to be accepted by `setReviewAssignment`, and a
 * round membership accepted there has to appear here. Two modules agreeing on a
 * role string is exactly the kind of contract that typechecks while the product
 * still disagrees with itself.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	membershipTrackTable,
	trackTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { reviewTable } from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setReviewAssignment } from './review-management';
import { addReviewRound } from './review-rounds';
import {
	acceptReviewerInvitation,
	addReviewer,
	committee,
	removeReviewer,
	setReviewerTracks
} from './reviewer-roster';

const suffix = `roster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const reviewerId = `rev-${suffix}`;
const reviewerEmail = `${reviewerId}@example.test`;
const otherId = `rev2-${suffix}`;
const otherEmail = `${otherId}@example.test`;
const inviteeId = `invitee-${suffix}`;
const inviteeEmail = `${inviteeId}@example.test`;
const roundReviewerId = `round-${suffix}`;
const roundReviewerEmail = `${roundReviewerId}@example.test`;
const loadReviewerId = `load-${suffix}`;
const loadReviewerEmail = `${loadReviewerId}@example.test`;

let conference: Conference;
let otherConference: Conference;
let platformTrackId: number;
let otherTrackId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Roster Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{ id: reviewerId, email: reviewerEmail, emailVerified: true, name: 'Rex Reviewer' },
		{ id: otherId, email: otherEmail, emailVerified: true, name: 'Ines Reviewer' },
		{ id: inviteeId, email: inviteeEmail, emailVerified: true, name: 'New Reviewer' },
		{ id: roundReviewerId, email: roundReviewerEmail, emailVerified: true, name: 'Round Reviewer' },
		{ id: loadReviewerId, email: loadReviewerEmail, emailVerified: true, name: 'Load Reviewer' }
	]);

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Roster Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();
	[platformTrackId] = (
		await db
			.insert(trackTable)
			.values({ conferenceId: conference.id, name: 'Platform' })
			.returning({ id: trackTable.id })
	).map((row) => row.id);
	[otherTrackId] = (
		await db
			.insert(trackTable)
			.values({ conferenceId: otherConference.id, name: 'Other' })
			.returning({ id: trackTable.id })
	).map((row) => row.id);
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, reviewerId));
	await db.delete(user).where(eq(user.id, otherId));
	await db.delete(user).where(eq(user.id, inviteeId));
	await db.delete(user).where(eq(user.id, roundReviewerId));
	await db.delete(user).where(eq(user.id, loadReviewerId));
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

describe('reviewer invitation acceptance', () => {
	it('creates the promised conference-scoped reviewer seat and checks the organization', async () => {
		expect(await acceptReviewerInvitation(conference.id, 'wrong-org', inviteeId)).toBe(false);
		expect(await acceptReviewerInvitation(conference.id, organizationId, inviteeId)).toBe(true);
		expect(await acceptReviewerInvitation(conference.id, organizationId, inviteeId)).toBe(true);

		const rows = (await committee(conference.id)).filter((row) => row.userId === inviteeId);
		expect(rows).toHaveLength(1);
	});
});

describe('reviewer track restrictions', () => {
	it('stores an exact conference-owned allow-list and can deliberately return to all tracks', async () => {
		const [member] = (await committee(conference.id)).filter((row) => row.userId === reviewerId);

		expect(
			await setReviewerTracks(conference.id, member.membershipId, 'selected', [otherTrackId])
		).toEqual({ ok: false, message: 'One of those tracks does not belong to this conference.' });
		expect(
			await setReviewerTracks(conference.id, member.membershipId, 'selected', [platformTrackId])
		).toEqual({ ok: true });
		expect(
			(await committee(conference.id)).find((row) => row.userId === reviewerId)?.trackIds
		).toEqual([platformTrackId]);

		expect(await setReviewerTracks(conference.id, member.membershipId, 'all', [])).toEqual({
			ok: true
		});
		expect(
			await db
				.select()
				.from(membershipTrackTable)
				.where(eq(membershipTrackTable.membershipId, member.membershipId))
		).toEqual([]);
	});

	it('refuses a selected mode with no tracks instead of silently widening access', async () => {
		const [member] = (await committee(conference.id)).filter((row) => row.userId === reviewerId);
		expect(await setReviewerTracks(conference.id, member.membershipId, 'selected', [])).toEqual({
			ok: false,
			message: 'Choose at least one track, or select All tracks.'
		});
	});
});

describe('removeReviewer', () => {
	it('refuses a membership id belonging to another conference', async () => {
		const [theirs] = await committee(otherConference.id);

		expect(await removeReviewer(conference.id, theirs.membershipId)).toEqual({ ok: false });
		expect(await committee(otherConference.id)).toHaveLength(1);
	});
});

describe('committee and assignment membership contract', () => {
	it('lets a freshly added reviewer be assigned to a submission', async () => {
		const round = await addReviewRound(conference.id, {
			name: 'Screening',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Assignable talk', status: 'submitted' })
			.returning({ id: submissionTable.id });

		const member = (await committee(conference.id)).find((row) => row.userId === reviewerId);
		expect(member).toBeDefined();
		if (!member) return;

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

	it('shows every round-scoped reviewer that assignment accepts, once per person', async () => {
		const screening = await addReviewRound(conference.id, {
			name: 'Round-scoped screening',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		const final = await addReviewRound(conference.id, {
			name: 'Round-scoped final',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(screening.ok).toBe(true);
		expect(final.ok).toBe(true);
		if (!screening.ok || !final.ok) return;
		const foreign = await addReviewRound(otherConference.id, {
			name: 'Other conference round',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(foreign.ok).toBe(true);
		if (!foreign.ok) return;

		await db.insert(membershipTable).values([
			{ userId: roundReviewerId, role: 'reviewer', scopeType: 'round', scopeId: screening.id },
			{ userId: roundReviewerId, role: 'reviewer', scopeType: 'round', scopeId: final.id },
			{ userId: otherId, role: 'reviewer', scopeType: 'round', scopeId: foreign.id }
		]);
		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Round assignment', status: 'submitted' })
			.returning({ id: submissionTable.id });

		expect(
			await setReviewAssignment(conference.id, submission.id, screening.id, roundReviewerId, true)
		).toBe('assigned');

		const shown = (await committee(conference.id)).filter(
			(member) => member.userId === roundReviewerId
		);
		expect(shown).toHaveLength(1);
		expect((await committee(conference.id)).map((member) => member.userId)).not.toContain(otherId);
		expect(shown[0]).toMatchObject({
			conferenceManaged: false,
			rounds: ['Round-scoped screening', 'Round-scoped final'],
			assigned: 1,
			outstanding: 1
		});
	});
});

describe('outstanding seats (#631)', () => {
	it('counts a real seat and ignores a draft seat on the same reviewer', async () => {
		const added = await addReviewer(conference.id, loadReviewerEmail);
		expect(added).toEqual({ ok: true, name: 'Load Reviewer' });

		const round = await addReviewRound(conference.id, {
			name: 'Load screening',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const [live] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Handed-in talk', status: 'submitted' })
			.returning({ id: submissionTable.id });
		const [draft] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Unfinished draft', status: 'draft' })
			.returning({ id: submissionTable.id });

		expect(await setReviewAssignment(conference.id, live.id, round.id, loadReviewerId, true)).toBe(
			'assigned'
		);
		expect(await setReviewAssignment(conference.id, draft.id, round.id, loadReviewerId, true)).toBe(
			'assigned'
		);

		const member = (await committee(conference.id)).find((row) => row.userId === loadReviewerId);
		expect(member).toMatchObject({ assigned: 1, submitted: 0, outstanding: 1 });
	});

	it('keeps a withdrawn seat in assigned, but not in outstanding', async () => {
		const memberBefore = (await committee(conference.id)).find(
			(row) => row.userId === loadReviewerId
		);
		expect(memberBefore).toBeDefined();
		if (!memberBefore) return;

		const round = await addReviewRound(conference.id, {
			name: 'Load withdrawn',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const [withdrawn] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: 'Speaker took it back',
				status: 'withdrawn'
			})
			.returning({ id: submissionTable.id });

		// The assignment had to exist before the speaker took the talk back —
		// `setReviewAssignment` now refuses a new seat on a withdrawn row (#716).
		await db.insert(reviewTable).values({
			reviewRoundId: round.id,
			submissionId: withdrawn.id,
			reviewerUserId: loadReviewerId,
			status: 'assigned'
		});

		const member = (await committee(conference.id)).find((row) => row.userId === loadReviewerId);
		expect(member).toMatchObject({
			assigned: memberBefore.assigned + 1,
			submitted: 0,
			outstanding: memberBefore.outstanding
		});
	});
});
