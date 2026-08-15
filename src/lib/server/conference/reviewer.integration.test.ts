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
import {
	cfpFormTable,
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
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
	recuseReview,
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

			expect(row?.rounds.map((round) => round.name)).toEqual(['Round 1', 'Blind round']);
		});

		/**
		 * #294. Both rounds open makes `byRoundWindowPriority` a tie, position
		 * decides, and the permalink could only ever open Round 1 — a reviewer
		 * holding the talk in both could not reach the anonymised scorecard while
		 * the queue kept calling it outstanding.
		 */
		it('opens the round the caller names, not the first one that ties', async () => {
			const now = await conferenceNow();
			const row = (await reviewQueue(now, ME)).find((q) => q.submissionId === mine);
			const [first, second] = row!.rounds;
			expect(first.id).not.toBe(second.id);

			const byPriority = await reviewerSubmission(now, ME, mine);
			expect(byPriority?.round.id).toBe(first.id);

			const named = await reviewerSubmission(now, ME, mine, second.id);
			expect(named?.round.id).toBe(second.id);
			expect(named?.anonymized).toBe(true);
			expect(named?.heldRounds.map((round) => round.id)).toEqual([first.id, second.id]);
		});

		it('writes the answers into the round they were filed for', async () => {
			const now = await conferenceNow();
			const rounds = (await reviewQueue(now, ME)).find((q) => q.submissionId === mine)!.rounds;
			const second = rounds[1];

			// Comment-only: enough to count as filed, and it needs no criterion from
			// this round's scorecard.
			const filed = { answers: {}, comment: 'Filed in the second round', submit: true };
			expect(await saveReview(now, ME, mine, filed, second.id)).toMatchObject({ ok: true });

			// The named round holds the answer; the first one is still empty. Without
			// the round the write landed here silently, which is worse than the
			// unreachable form: the reviewer sees a filed review they never wrote.
			expect((await reviewerSubmission(now, ME, mine, second.id))?.own.status).toBe('submitted');
			expect((await reviewerSubmission(now, ME, mine, rounds[0].id))?.own.status).toBe('assigned');
		});

		it('falls back to the priority rule for a round the reviewer does not hold', async () => {
			const now = await conferenceNow();
			const first = (await reviewQueue(now, ME)).find((q) => q.submissionId === mine)!.rounds[0];

			// A stale link is not a permission problem: it opens the round that
			// still wants work rather than 404ing the talk away.
			expect((await reviewerSubmission(now, ME, mine, 9_999_999))?.round.id).toBe(first.id);
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

	it('includes the custom CFP answers the scorecard used to omit', async () => {
		const [form] = await db
			.insert(cfpFormTable)
			.values({ conferenceId: conference.id, title: 'Proposals', status: 'published' })
			.returning();
		const [field] = await db
			.insert(formFieldTable)
			.values({
				cfpFormId: form.id,
				label: 'Have you given this talk before?',
				kind: 'boolean',
				position: 0
			})
			.returning();
		await db.insert(submissionAnswerTable).values({
			submissionId: mine,
			formFieldId: field.id,
			value: 'true'
		});

		const detail = await reviewerSubmission(await conferenceNow(), ME, mine);
		expect(detail?.answers).toEqual([
			{ label: 'Have you given this talk before?', kind: 'boolean', value: 'true' }
		]);
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

		const [form] = await db
			.insert(cfpFormTable)
			.values({ conferenceId: conference.id, title: 'Proposals', status: 'published' })
			.returning();
		const [bio] = await db
			.insert(formFieldTable)
			.values({
				cfpFormId: form.id,
				label: 'Kurzbio',
				kind: 'short_text',
				position: 0
			})
			.returning();
		await db.insert(submissionAnswerTable).values({
			submissionId: alsoMine,
			formFieldId: bio.id,
			value: 'Priya Raman builds compilers in Berlin.'
		});

		const named = await reviewerSubmission(await conferenceNow(), ME, alsoMine);
		expect(named?.speakers).toEqual(['Priya Raman']);
		// #451 rides in the open round: one entry per speaker, even a first-timer.
		expect(named?.speakerHistory.map((h) => h.name)).toEqual(['Priya Raman']);
		expect(named?.answers).toEqual([
			{
				label: 'Kurzbio',
				kind: 'short_text',
				value: 'Priya Raman builds compilers in Berlin.'
			}
		]);

		// Move my review into the anonymised round: the name must not reach the page,
		// and neither may the free-text answer that carries it.
		await db
			.update(reviewTable)
			.set({ reviewRoundId: anonRoundId })
			.where(eq(reviewTable.submissionId, alsoMine));

		const hidden = await reviewerSubmission(await conferenceNow(), ME, alsoMine);
		expect(hidden?.anonymized).toBe(true);
		expect(hidden?.speakers).toEqual([]);
		expect(hidden?.answers).toEqual([]);
		// The history is identity too (#451): "spoke here in 2024" points at the
		// person harder than the name that was taken away. Same gate, same round.
		expect(hidden?.speakerHistory).toEqual([]);
		expect(JSON.stringify(hidden)).not.toContain('Priya Raman');
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

	it('refuses a rating outside its own scale, and says which one and why (#477)', async () => {
		const now = await conferenceNow();
		await saveReview(now, ME, mine, {
			answers: { [criterionId]: '3' },
			comment: '',
			submit: false
		});

		// It used to be dropped: not clamped — clamping turns a typo into an opinion
		// the reviewer never held — but not refused either, so the reviewer was told
		// their progress was saved while the column went blank behind them.
		expect(
			await saveReview(now, ME, mine, {
				answers: { [criterionId]: '50' },
				comment: '',
				submit: false
			})
		).toEqual({
			ok: false,
			reason: 'rating_off_scale',
			message: 'Relevance is scored out of 5, so 50 is off the scale.'
		});

		// And nothing was written on the way to the refusal — the earlier 3 stands.
		expect((await reviewerSubmission(now, ME, mine))?.criteria[0].value).toBe(3);
	});

	it('refuses the same number on a submit, not only on a draft', async () => {
		const now = await conferenceNow();

		expect(
			await saveReview(now, ME, mine, {
				answers: { [criterionId]: '7' },
				comment: 'Loved it',
				submit: true
			})
		).toMatchObject({ ok: false, reason: 'rating_off_scale' });
		expect((await reviewerSubmission(now, ME, mine))?.own.status).toBe('assigned');
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
 * ABS-01. #207 gave the round an `opensAt`/`closesAt` pair and recorded it without
 * enforcing it. These are the POSTs that a date has to refuse to be a date: hiding
 * the buttons is not the guard, and a reviewer with a stale tab never sees them.
 */
describe('the round’s window', () => {
	const DAY = 86_400_000;

	/** Puts my round in a window without touching anything else about it. */
	async function windowIs(opensAt: Date | null, closesAt: Date | null) {
		await db
			.update(reviewRoundTable)
			.set({ opensAt, closesAt })
			.where(eq(reviewRoundTable.id, roundId));
		return conferenceNow();
	}

	/** A function, not a constant: `criterionId` is only set in `beforeEach`. */
	/** A second round on the same talk, assigned to me, after round 1 in board order. */
	async function secondRoundOn(
		submissionId: number,
		window: { opensAt?: Date; closesAt?: Date }
	): Promise<number> {
		const [plan] = await db
			.select()
			.from(evaluationPlanTable)
			.where(eq(evaluationPlanTable.conferenceId, conference.id));
		const [second] = await db
			.insert(reviewRoundTable)
			.values({
				evaluationPlanId: plan.id,
				name: 'Second look',
				position: 2,
				opensAt: window.opensAt ?? null,
				closesAt: window.closesAt ?? null
			})
			.returning();
		await db.insert(reviewTable).values({
			reviewRoundId: second.id,
			submissionId,
			reviewerUserId: ME,
			status: 'assigned'
		});
		return second.id;
	}

	const answers = () => ({ answers: { [criterionId]: '4' }, comment: 'On time', submit: true });

	it('takes the review while the round is running', async () => {
		const now = await windowIs(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
		expect(await saveReview(now, ME, mine, answers())).toEqual({ ok: true });
	});

	it('refuses before the round opens', async () => {
		const now = await windowIs(new Date(Date.now() + DAY), null);

		expect(await saveReview(now, ME, mine, answers())).toEqual({
			ok: false,
			reason: 'round_not_open'
		});
		// Nothing was written on the way to the refusal.
		expect((await reviewerSubmission(now, ME, mine))?.criteria[0].value).toBeNull();
	});

	it('refuses after the round closes, and refuses the draft too', async () => {
		const now = await windowIs(null, new Date(Date.now() - DAY));

		expect(await saveReview(now, ME, mine, answers())).toEqual({
			ok: false,
			reason: 'round_closed'
		});
		// "Save progress" writes the same scores the submit does, so leaving it open
		// would hand the whole edit back through the quieter button.
		expect(await saveReview(now, ME, mine, { ...answers(), submit: false })).toEqual({
			ok: false,
			reason: 'round_closed'
		});
		expect((await reviewerSubmission(now, ME, mine))?.criteria[0].value).toBeNull();
	});

	it('will not let a review already filed be changed after the close', async () => {
		const open = await windowIs(null, new Date(Date.now() + DAY));
		expect(await saveReview(open, ME, mine, answers())).toEqual({ ok: true });

		const shut = await windowIs(null, new Date(Date.now() - DAY));
		expect(
			await saveReview(shut, ME, mine, {
				answers: { [criterionId]: '1' },
				comment: '',
				submit: true
			})
		).toEqual({ ok: false, reason: 'round_closed' });
		expect((await reviewerSubmission(shut, ME, mine))?.criteria[0].value).toBe(4);
	});

	it('leaves a round with no dates open — the old conferences are not locked out', async () => {
		const now = await windowIs(null, null);
		expect(await saveReview(now, ME, mine, answers())).toEqual({ ok: true });
	});

	it('tells the queue and the scorecard the same thing the POST is judged by', async () => {
		const closesAt = new Date(Date.now() - DAY);
		const now = await windowIs(null, closesAt);

		const [row] = (await reviewQueue(now, ME)).filter((r) => r.submissionId === mine);
		expect(row.window.state).toBe('closed');
		expect(row.window.label).toBe('Closed');
		expect((await reviewerSubmission(now, ME, mine))?.window.state).toBe('closed');
		expect((await reviewerSubmission(now, ME, mine))?.window.notice).toContain('closed on');
	});

	/**
	 * The queue and the form have to name the SAME round. `ownReview` used to take
	 * whichever row Postgres returned first, which was harmless while only
	 * `anonymized` hung off it — with the window on it, the queue would say "To do"
	 * from the open round and the page behind the link would refuse from the closed
	 * one.
	 */
	it('opens the form on the round that still wants work, not the shut one', async () => {
		// The closed round is round 1: lower position, lower id, so it is the row an
		// unordered query hands back.
		await windowIs(null, new Date(Date.now() - DAY));
		const openRoundId = await secondRoundOn(mine, { closesAt: new Date(Date.now() + DAY) });

		const now = await conferenceNow();
		const submission = await reviewerSubmission(now, ME, mine);
		expect(submission?.window.state).toBe('open');
		// And it really is the second round's form: filing has to land there.
		expect(await saveReview(now, ME, mine, answers())).toEqual({ ok: true });
		const [filed] = await db
			.select({ roundId: reviewTable.reviewRoundId })
			.from(reviewTable)
			.where(and(eq(reviewTable.id, submission!.own.reviewId)));
		expect(filed.roundId).toBe(openRoundId);
	});

	it('falls back to a shut round when every round I hold it in is shut', async () => {
		await windowIs(null, new Date(Date.now() - DAY));
		await secondRoundOn(mine, { opensAt: new Date(Date.now() + DAY) });

		const now = await conferenceNow();
		// "Opens tomorrow" is a thing to come back for; "closed" is not, so the
		// waiting round speaks for both.
		expect((await reviewerSubmission(now, ME, mine))?.window.state).toBe('not_yet_open');
		expect(await saveReview(now, ME, mine, answers())).toEqual({
			ok: false,
			reason: 'round_not_open'
		});
	});

	/**
	 * #464: the row said "To do" while every round it could mean was answered or
	 * shut. A volunteer opening the queue counted 22 jobs and had 9.
	 */
	it('lets the round I still owe speak, not the one I have already filed', async () => {
		// Round 1 is open and filed by me; round 2 opens in a week. Nothing is asked
		// of me today, and the badge has to say so.
		await windowIs(null, null);
		await secondRoundOn(mine, { opensAt: new Date(Date.now() + 7 * DAY) });
		const now = await conferenceNow();
		expect(await saveReview(now, ME, mine, answers(), undefined)).toEqual({ ok: true });

		const [row] = (await reviewQueue(now, ME)).filter((r) => r.submissionId === mine);
		expect(row.window.state).toBe('not_yet_open');
		expect(row.ownReviewSubmitted).toBe(false);

		// And the form the row links to is that same waiting round — a badge and a
		// page that disagree send the reviewer to work the server refuses.
		expect((await reviewerSubmission(now, ME, mine))?.window.state).toBe('not_yet_open');
	});

	it('lets an open round win over a closed one when I hold the talk in both', async () => {
		await windowIs(null, new Date(Date.now() - DAY));
		// A second, still-running round on the same talk: the queue's job is to say
		// whether anything is asked of me, and something is.
		await secondRoundOn(mine, { closesAt: new Date(Date.now() + DAY) });

		const [row] = (await reviewQueue(await conferenceNow(), ME)).filter(
			(r) => r.submissionId === mine
		);
		expect(row.window.state).toBe('open');
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

	it('refuses an out-of-scale rating as the only answer, and does not open the peers', async () => {
		const blind = await setMode('blind_until_reviewed');
		await peerReviews(mine, '5');

		// 50 on a five-point scale is refused outright now (#477); it used to fall
		// through to `empty_submit`, because `writeScore` dropped it and there was
		// nothing left. Either way it must not count as having reviewed — that is
		// what would cost the peers their privacy.
		const result = await saveReview(blind, ME, mine, {
			answers: { [criterionId]: '50' },
			comment: '',
			submit: true
		});

		expect(result).toMatchObject({ ok: false, reason: 'rating_off_scale' });
		expect((await reviewerSubmission(blind, ME, mine))?.peers).toEqual([]);
		expect((await reviewerSubmission(blind, ME, mine))?.peersWithheld).toBe(true);
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

/**
 * RV-P1-01: the speaker took the talk back.
 *
 * It stood in the queue as "To do" with a live form, so a reviewer could spend an
 * hour on a talk that had left — and could file the review afterwards, because the
 * only thing stopping them was a page that no longer drew the button.
 */
describe('a withdrawn submission', () => {
	beforeEach(async () => {
		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(eq(submissionTable.id, mine));
	});

	it('is still listed, but marked withdrawn rather than outstanding', async () => {
		await db
			.update(submissionTable)
			.set({ status: 'withdrawn' })
			.where(eq(submissionTable.id, mine));

		const queue = await reviewQueue(await conferenceNow(), ME);
		const row = queue.find((q) => q.submissionId === mine);

		// Listed — a row that vanishes is indistinguishable from one never assigned.
		expect(row).toBeDefined();
		expect(row!.withdrawn).toBe(true);
		// And honest about what this reviewer actually filed.
		expect(row!.ownReviewSubmitted).toBe(false);
	});

	it('leaves a live talk unmarked', async () => {
		const queue = await reviewQueue(await conferenceNow(), ME);

		expect(queue.find((q) => q.submissionId === mine)!.withdrawn).toBe(false);
	});

	it('refuses a review filed against it, however the request arrives', async () => {
		await db
			.update(submissionTable)
			.set({ status: 'withdrawn' })
			.where(eq(submissionTable.id, mine));

		// The stale-tab case: the page is gone, the POST is not.
		const result = await saveReview(await conferenceNow(), ME, mine, {
			answers: { [criterionId]: '5' },
			comment: 'Filed after the withdrawal.',
			submit: true
		});

		expect(result).toEqual({ ok: false, reason: 'withdrawn' });

		const [row] = await db
			.select({ status: reviewTable.status, comment: reviewTable.comment })
			.from(reviewTable)
			.where(and(eq(reviewTable.submissionId, mine), eq(reviewTable.reviewerUserId, ME)));
		expect(row.status).not.toBe('submitted');
		expect(row.comment).not.toBe('Filed after the withdrawal.');
	});

	it('still accepts a review while the talk is live, so the guard is not blanket', async () => {
		const result = await saveReview(await conferenceNow(), ME, mine, {
			answers: { [criterionId]: '4' },
			comment: 'Filed while it was live.',
			submit: true
		});

		expect(result).toEqual({ ok: true });
	});

	it('hands back the title so the queue can name what was recused (#463)', async () => {
		const [review] = await db
			.select({ id: reviewTable.id })
			.from(reviewTable)
			.where(and(eq(reviewTable.submissionId, mine), eq(reviewTable.reviewerUserId, ME)));

		const conference = await conferenceNow();
		const result = await recuseReview(conference.id, ME, mine, review.id);

		expect(result.ok).toBe(true);
		expect(result).toHaveProperty('title');
		expect((result as { title: string | null }).title).toBeTruthy();

		const [row] = await db
			.select({ status: reviewTable.status })
			.from(reviewTable)
			.where(eq(reviewTable.id, review.id));
		expect(row.status).toBe('recused');
	});

	it('refuses recusal so the withdrawn row does not vanish from the queue (#183)', async () => {
		await db
			.update(submissionTable)
			.set({ status: 'withdrawn' })
			.where(eq(submissionTable.id, mine));

		const [review] = await db
			.select({ id: reviewTable.id })
			.from(reviewTable)
			.where(and(eq(reviewTable.submissionId, mine), eq(reviewTable.reviewerUserId, ME)));

		const conference = await conferenceNow();
		expect(await recuseReview(conference.id, ME, mine, review.id)).toEqual({
			ok: false,
			reason: 'withdrawn'
		});

		const [row] = await db
			.select({ status: reviewTable.status })
			.from(reviewTable)
			.where(eq(reviewTable.id, review.id));
		expect(row.status).toBe('assigned');
	});
});
