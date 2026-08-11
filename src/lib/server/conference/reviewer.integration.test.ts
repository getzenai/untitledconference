/**
 * The reviewer surface has three promises that only a query can keep: you read what
 * you were assigned, you do not read your peers before your own verdict when the
 * conference says so, and filing a review mails nobody.
 *
 * All three are tested here against the database rather than through the page, because
 * a page that hides something is not the same as a server that never sent it.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	ownReviewAccess,
	requireReviewer,
	reviewQueue,
	reviewedConferences,
	reviewerSubmission,
	saveReview
} from './reviewer';

const suffix = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

const ME = `me-${suffix}`;
const PEER = `peer-${suffix}`;
const STRANGER = `stranger-${suffix}`;
const PEOPLE = [ME, PEER, STRANGER];

let conference: Conference;
let roundId: number;
let anonRoundId: number;
let criterionId: number;
let mine: number;
let alsoMine: number;
let notMine: number;

/** Reads the conference back, because the visibility mode is read off the row. */
async function conferenceNow(): Promise<Conference> {
	const [row] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.id, conference.id));
	return row;
}

async function setMode(mode: 'open' | 'blind_until_reviewed') {
	await db
		.update(conferenceTable)
		.set({ reviewVisibility: mode })
		.where(eq(conferenceTable.id, conference.id));
	return conferenceNow();
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Reviewer Org',
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
});

beforeEach(async () => {
	if (conference) await db.delete(conferenceTable).where(eq(conferenceTable.id, conference.id));

	[conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'DevFlow Conf',
			slug: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
		})
		.returning();

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId: conference.id, name: 'Plan' })
		.returning();
	const rounds = await db
		.insert(reviewRoundTable)
		.values([
			{ evaluationPlanId: plan.id, name: 'Round 1', position: 0 },
			{ evaluationPlanId: plan.id, name: 'Blind round', anonymized: true, position: 1 }
		])
		.returning();
	roundId = rounds[0].id;
	anonRoundId = rounds[1].id;

	const [criterion] = await db
		.insert(scorecardCriterionTable)
		.values({ reviewRoundId: roundId, label: 'Relevance', kind: 'rating', scaleMax: 5 })
		.returning();
	criterionId = criterion.id;

	const submissions = await db
		.insert(submissionTable)
		.values([
			{ conferenceId: conference.id, title: 'Assigned to me', status: 'in_review' },
			{ conferenceId: conference.id, title: 'Also mine', status: 'in_review' },
			{ conferenceId: conference.id, title: 'Somebody else’s', status: 'in_review' }
		])
		.returning();
	[mine, alsoMine, notMine] = submissions.map((s) => s.id);

	await db.insert(reviewTable).values([
		{ reviewRoundId: roundId, submissionId: mine, reviewerUserId: ME, status: 'assigned' },
		{ reviewRoundId: roundId, submissionId: alsoMine, reviewerUserId: ME, status: 'assigned' },
		{ reviewRoundId: roundId, submissionId: notMine, reviewerUserId: PEER, status: 'assigned' }
	]);

	await db.insert(membershipTable).values({
		userId: ME,
		role: 'reviewer',
		scopeType: 'round',
		scopeId: roundId
	});
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	for (const id of PEOPLE) await db.delete(user).where(eq(user.id, id));
});

/** A peer review with a score, so there is something to withhold. */
async function peerReviews(submissionId: number, value: string) {
	const [review] = await db
		.insert(reviewTable)
		.values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: PEER,
			status: 'submitted',
			comment: 'Strong, would schedule.',
			submittedAt: new Date()
		})
		.returning();

	// Written directly rather than through `saveReview`, which is itself under test.
	await db.insert(reviewScoreTable).values({
		reviewId: review.id,
		scorecardCriterionId: criterionId,
		valueNumber: value
	});

	return review.id;
}

describe('who may open the reviewer surface', () => {
	it('lets in a reviewer of one of the conference rounds', async () => {
		const { conference: found } = await requireReviewer(ME, conference.slug);
		expect(found.id).toBe(conference.id);
	});

	it('answers 404 for somebody with no reviewer seat', async () => {
		await expect(requireReviewer(STRANGER, conference.slug)).rejects.toMatchObject({
			status: 404
		});
	});

	it('answers 404 for an unknown slug, so the two cases are indistinguishable', async () => {
		await expect(requireReviewer(ME, 'no-such-conference')).rejects.toMatchObject({ status: 404 });
	});

	it('lists the conference in the reviewer’s own picker only', async () => {
		expect((await reviewedConferences(ME)).map((c) => c.id)).toContain(conference.id);
		expect(await reviewedConferences(STRANGER)).toEqual([]);
	});
});

describe('the queue', () => {
	it('contains exactly the submissions assigned to me', async () => {
		const queue = await reviewQueue(await conferenceNow(), ME);

		expect(queue.map((q) => q.submissionId).sort()).toEqual([mine, alsoMine].sort());
		expect(queue.map((q) => q.submissionId)).not.toContain(notMine);
	});

	describe('the same submission assigned to me in two rounds', () => {
		// Nested, not `beforeAll`: the outer hook drops and rebuilds the conference
		// before every test, which would take this row (and its round ids) with it.
		beforeEach(async () => {
			await db
				.insert(reviewTable)
				.values({ reviewRoundId: anonRoundId, submissionId: mine, reviewerUserId: ME });
		});

		// The page keys its list on `submissionId`. A second row for the same
		// submission is a duplicate key, and Svelte answers that by rendering
		// nothing at all — the whole reviewer surface was a blank white page.
		//
		// `sort()` cannot see this: [a, a, b].sort() still contains every expected
		// id, so the assertion above passes on a list that crashes the browser.
		// Uniqueness has to be asserted as uniqueness.
		it('lists it once, not once per round', async () => {
			const ids = (await reviewQueue(await conferenceNow(), ME)).map((q) => q.submissionId);

			expect(new Set(ids).size).toBe(ids.length);
			expect(ids.filter((id) => id === mine)).toHaveLength(1);
		});

		it('names both rounds on the one row', async () => {
			const row = (await reviewQueue(await conferenceNow(), ME)).find(
				(q) => q.submissionId === mine
			);

			expect(row?.rounds).toEqual(['Round 1', 'Blind round']);
		});

		it('stays outstanding while either round is unfiled', async () => {
			await db
				.update(reviewTable)
				.set({ status: 'submitted', submittedAt: new Date() })
				.where(and(eq(reviewTable.reviewRoundId, roundId), eq(reviewTable.submissionId, mine)));

			const row = (await reviewQueue(await conferenceNow(), ME)).find(
				(q) => q.submissionId === mine
			);
			// Round 1 is filed, the blind round is not. Finishing one does not answer
			// the other, and a queue that ticks it off hides real work.
			expect(row?.ownReviewSubmitted).toBe(false);
		});
	});

	it('sorts by coverage and by score', async () => {
		await peerReviews(mine, '5');

		const byCoverage = await reviewQueue(await conferenceNow(), ME, 'coverage');
		expect(byCoverage[0].submissionId).toBe(alsoMine); // nobody has reviewed it

		const byScore = await reviewQueue(await conferenceNow(), ME, 'score');
		expect(byScore[0].submissionId).toBe(mine); // the only one with a score
	});
});

describe('blind until reviewed', () => {
	beforeEach(async () => {
		await peerReviews(mine, '5');
	});

	it('shows peers immediately in the open mode', async () => {
		const open = await setMode('open');

		const queue = await reviewQueue(open, ME);
		expect(queue.find((q) => q.submissionId === mine)?.score).not.toBeNull();

		const detail = await reviewerSubmission(open, ME, mine);
		expect(detail?.peers).toHaveLength(1);
		expect(detail?.peersWithheld).toBe(false);
	});

	/**
	 * A recusal is not an opinion. `reviewsOn` filters recused rows out, and this
	 * pins that filter: found while mutation-probing #57's door — removing the
	 * `ne(status, 'recused')` there left the whole suite green, which means a
	 * refactor could have shown a withdrawn review as a peer verdict and, on the
	 * organizer's page, as part of the review record.
	 */
	it('never reads a recused review as a peer verdict', async () => {
		const open = await setMode('open');
		// A second reviewer who withdrew. It has to be a different person: one review
		// per reviewer and round, so the fixture's peer cannot also be the recused one.
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId: mine,
			reviewerUserId: STRANGER,
			status: 'recused',
			comment: 'Conflict of interest.'
		});

		const detail = await reviewerSubmission(open, ME, mine);

		// The surviving peer is the one from the fixture; the recused one is gone
		// from both the list and the outstanding count.
		expect(detail?.peers).toHaveLength(1);
		expect(detail?.peersPending).toBe(0);
	});

	it('withholds the score AND the comment until my own review is submitted', async () => {
		const blind = await setMode('blind_until_reviewed');

		const before = await reviewerSubmission(blind, ME, mine);
		expect(before?.peers).toEqual([]);
		expect(before?.peersWithheld).toBe(true);
		// The count stays visible — "somebody has answered" gives away no opinion.
		expect((await reviewQueue(blind, ME)).find((q) => q.submissionId === mine)).toMatchObject({
			score: null,
			reviewsSubmitted: 1
		});

		await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Good',
			submit: true
		});

		const after = await reviewerSubmission(blind, ME, mine);
		expect(after?.peers).toHaveLength(1);
		expect(after?.peers[0].comment).toBe('Strong, would schedule.');
		expect(
			(await reviewQueue(blind, ME)).find((q) => q.submissionId === mine)?.score
		).not.toBeNull();
	});

	it('does not unlock on a saved draft — half a review is what the mode protects', async () => {
		const blind = await setMode('blind_until_reviewed');

		await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Still thinking',
			submit: false
		});

		expect((await reviewerSubmission(blind, ME, mine))?.peers).toEqual([]);
	});
});

describe('a peer’s unfiled draft', () => {
	/** Somebody else's half-written review: values and a comment, never submitted. */
	async function peerDraft(submissionId: number) {
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: STRANGER,
				status: 'assigned',
				comment: 'Leaning reject, need to reread'
			})
			.returning();
		await db
			.insert(reviewScoreTable)
			.values({ reviewId: review.id, scorecardCriterionId: criterionId, valueNumber: '1' });
		return review.id;
	}

	it('never reaches the client, not even in the open mode', async () => {
		const open = await setMode('open');
		await peerDraft(mine);

		const detail = await reviewerSubmission(open, ME, mine);

		// The mode is open, so nothing is withheld — and there is still nothing to show,
		// because the only other reviewer has not filed. What the page gets is a count.
		expect(detail?.peers).toEqual([]);
		expect(detail?.peersWithheld).toBe(false);
		expect(detail?.peersPending).toBe(1);
		expect(JSON.stringify(detail)).not.toContain('Leaning reject');
	});

	it('is counted next to the peers who did file', async () => {
		const open = await setMode('open');
		await peerReviews(mine, '5');
		await peerDraft(mine);

		const detail = await reviewerSubmission(open, ME, mine);
		expect(detail?.peers).toHaveLength(1);
		expect(detail?.peers[0].submitted).toBe(true);
		expect(detail?.peersPending).toBe(1);
	});
});

describe('one submission', () => {
	it('is a null for a submission nobody assigned to me', async () => {
		expect(await reviewerSubmission(await conferenceNow(), ME, notMine)).toBeNull();
	});

	it('keeps the author out of an anonymised round', async () => {
		const [speaker] = await db
			.insert(speakerProfileTable)
			.values({ organizationId, name: 'Priya Raman', sortName: 'Raman, Priya' })
			.returning();
		await db.insert(submissionSpeakerTable).values({
			submissionId: alsoMine,
			speakerProfileId: speaker.id,
			isPrimary: true,
			position: 0
		});

		const named = await reviewerSubmission(await conferenceNow(), ME, alsoMine);
		expect(named?.speakers).toEqual(['Priya Raman']);

		// Move my review into the anonymised round: the name must not reach the page.
		await db
			.update(reviewTable)
			.set({ reviewRoundId: anonRoundId })
			.where(eq(reviewTable.submissionId, alsoMine));

		const hidden = await reviewerSubmission(await conferenceNow(), ME, alsoMine);
		expect(hidden?.anonymized).toBe(true);
		expect(hidden?.speakers).toEqual([]);
	});
});

describe('saving a review', () => {
	it('stores the answers and can be revised', async () => {
		const now = await conferenceNow();

		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '3' },
			comment: 'Fine',
			submit: true
		});
		expect((await reviewerSubmission(now, ME, mine))?.criteria[0].value).toBe(3);

		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '5' },
			comment: 'Better',
			submit: true
		});
		const revised = await reviewerSubmission(now, ME, mine);
		expect(revised?.criteria[0].value).toBe(5);
		expect(revised?.own.comment).toBe('Better');
	});

	it('drops a rating outside its own scale instead of clamping it', async () => {
		const now = await conferenceNow();

		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '50' },
			comment: '',
			submit: false
		});

		// Clamping would turn a typo into an opinion the reviewer never held.
		expect((await reviewerSubmission(now, ME, mine))?.criteria[0].value).toBeNull();
	});

	it('emails nobody — deciding and telling people are separate acts', async () => {
		const now = await conferenceNow();

		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '5' },
			comment: 'Yes',
			submit: true
		});

		const mails = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.conferenceId, conference.id));
		expect(mails).toEqual([]);
	});

	it('refuses to write a review for a submission I was not assigned', async () => {
		expect(
			await saveReview(await conferenceNow(), ME, notMine, {
				answers: {},
				comment: 'Sneaky',
				submit: true
			})
		).toEqual({ ok: false, reason: 'not_assigned' });
	});
});

/**
 * #33. `blind_until_reviewed` unlocks the peers on a status flag, which makes the flag
 * worth gaming. Both exploits are about the flag, not about the reading rule — the
 * withholding query itself was already right.
 */
describe('the two ways a reviewer could buy the peers cheaply', () => {
	/** The review row as the coverage count and the unlock condition see it. */
	async function ownRow() {
		const [row] = await db
			.select({ status: reviewTable.status, submittedAt: reviewTable.submittedAt })
			.from(reviewTable)
			.where(eq(reviewTable.reviewerUserId, ME))
			.orderBy(reviewTable.id);
		return row;
	}

	it('refuses a submit with nothing in it, and the peers stay hidden', async () => {
		const blind = await setMode('blind_until_reviewed');
		// Without a peer to withhold, every assertion below would pass on an empty
		// board and prove nothing.
		await peerReviews(mine, '5');

		const result = await saveReview(blind, ME, mine, {
			answers: {},
			comment: '   ',
			submit: true
		});

		expect(result).toEqual({ ok: false, reason: 'empty_submit' });
		// The refusal is worth nothing if the flag flipped anyway — this is the part
		// that actually costs the peers their privacy.
		expect((await ownRow()).status).not.toBe('submitted');
		expect((await reviewerSubmission(blind, ME, mine))?.peers).toEqual([]);
		expect((await reviewerSubmission(blind, ME, mine))?.peersWithheld).toBe(true);
	});

	it('refuses an out-of-scale rating as the only answer — it is not stored either', async () => {
		const blind = await setMode('blind_until_reviewed');
		await peerReviews(mine, '5');

		// 50 on a five-point scale is dropped by `writeScore`. If it counted as an
		// answer here, "submit 50" would be the empty submit wearing a number.
		const result = await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '50' },
			comment: '',
			submit: true
		});

		expect(result).toEqual({ ok: false, reason: 'empty_submit' });
		expect((await reviewerSubmission(blind, ME, mine))?.peers).toEqual([]);
	});

	it('accepts a comment with no scores — that is a judgement, not an empty submit', async () => {
		const blind = await setMode('blind_until_reviewed');
		await peerReviews(mine, '5');

		const result = await saveReview(blind, ME, mine, {
			answers: {},
			comment: 'Out of scope for this track, and I would rather say why than score it.',
			submit: true
		});

		expect(result).toEqual({ ok: true });
		expect((await ownRow()).status).toBe('submitted');
		expect((await reviewerSubmission(blind, ME, mine))?.peers).toHaveLength(1);
	});

	it('still lets me save an empty draft — only submitting needs an opinion', async () => {
		const now = await conferenceNow();

		expect(await saveReview(now, ME, mine, { answers: {}, comment: '', submit: false })).toEqual({
			ok: true
		});
	});

	it('will not let a filed review retreat to unfiled', async () => {
		const blind = await setMode('blind_until_reviewed');

		await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Filed',
			submit: true
		});
		const filed = await ownRow();
		expect(filed.status).toBe('submitted');
		expect(filed.submittedAt).not.toBeNull();

		// The un-submit trick: read the peers, then drop out of the coverage count.
		const result = await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Second thoughts',
			submit: false
		});

		expect(result).toEqual({ ok: true });
		const after = await ownRow();
		expect(after.status).toBe('submitted');
		// The first filing is when the peers stopped being hidden; a later edit does
		// not move that moment.
		expect(after.submittedAt?.getTime()).toBe(filed.submittedAt?.getTime());
	});

	it('saves the edit while refusing the retreat', async () => {
		const now = await conferenceNow();

		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '2' },
			comment: 'First',
			submit: true
		});
		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '5' },
			comment: 'Revised',
			submit: false
		});

		// Refusing the status change must not refuse the content change with it.
		const detail = await reviewerSubmission(now, ME, mine);
		expect(detail?.criteria[0].value).toBe(5);
		expect(detail?.own.comment).toBe('Revised');
	});
});

/**
 * The door the organizer's submission page offers (#57).
 *
 * It has to answer exactly what the reviewer surface would answer, because the
 * whole point of asking here is to not offer a link into a 404. The two halves are
 * checked apart on purpose: an assignment without a seat is a real state — the
 * assignment matrix carries such a person as not eligible — and a seat without an
 * assignment is the ordinary state of every organizer.
 */
describe('the own-review door on the organizer page', () => {
	it('opens for an assigned reviewer and names the state it is in', async () => {
		await expect(ownReviewAccess(conference.id, ME, mine)).resolves.toMatchObject({
			status: 'assigned'
		});

		await saveReview(await conferenceNow(), ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Filed.',
			submit: true
		});

		await expect(ownReviewAccess(conference.id, ME, mine)).resolves.toMatchObject({
			status: 'submitted'
		});
	});

	it('stays shut for a seat with no assignment on this submission', async () => {
		await expect(ownReviewAccess(conference.id, ME, notMine)).resolves.toBeNull();
	});

	/** PEER is assigned to `notMine` and holds no reviewer seat: the 404 case. */
	it('stays shut for an assignment whose seat is gone', async () => {
		await expect(ownReviewAccess(conference.id, PEER, notMine)).resolves.toBeNull();
	});

	it('stays shut after a recusal, exactly as the reviewer surface does', async () => {
		await db
			.update(reviewTable)
			.set({ status: 'recused' })
			.where(eq(reviewTable.submissionId, mine));

		await expect(ownReviewAccess(conference.id, ME, mine)).resolves.toBeNull();
		await expect(reviewerSubmission(await conferenceNow(), ME, mine)).resolves.toBeNull();
	});
});
