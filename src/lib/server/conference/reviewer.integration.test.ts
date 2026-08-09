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
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
		).toBe(false);
	});
});
