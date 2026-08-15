/**
 * The acceptance call, against a real database (#444).
 *
 * Three things here can only be wrong in SQL, never in a typecheck: the accepted
 * count per track (a `group by` that silently drops the null-track rows), one
 * member's ranking (their own score, not the pooled average — the two agree in
 * every fixture where everybody scores alike, which is why the fixture here does
 * not), and the scope of both, since a neighbouring conference in the same
 * organization is exactly what a missing `conferenceId` fails to exclude.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	trackTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { committeeSeats, lobbyingQueue, setSlotCapacity, slotBoard } from './decision-room';

const suffix = `decroom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const ADA = `ada-${suffix}`;
const BRUNO = `bruno-${suffix}`;

let conference: Conference;
let neighbour: Conference;
let platformTrackId: number;
let peopleTrackId: number;
let roundId: number;
let criterionId: number;

async function addSubmission(
	target: Conference,
	title: string,
	status: 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'draft',
	trackId: number | null = null
) {
	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId: target.id, title, status, trackId })
		.returning();
	return row.id;
}

async function addReview(submissionId: number, reviewerUserId: string, value: number | null) {
	const [review] = await db
		.insert(reviewTable)
		.values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId,
			status: 'submitted',
			submittedAt: new Date()
		})
		.returning();

	if (value !== null) {
		await db.insert(reviewScoreTable).values({
			reviewId: review.id,
			scorecardCriterionId: criterionId,
			valueNumber: String(value)
		});
	}
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Decision Org',
		slug: organizationId,
		createdAt: new Date()
	});

	for (const id of [ADA, BRUNO]) {
		await db.insert(user).values({
			id,
			name: id === ADA ? 'Ada' : 'Bruno',
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Decision Conf', slug: suffix })
		.returning();
	[neighbour] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();

	[{ id: platformTrackId }] = await db
		.insert(trackTable)
		.values({ conferenceId: conference.id, name: 'Platform', position: 0 })
		.returning({ id: trackTable.id });
	[{ id: peopleTrackId }] = await db
		.insert(trackTable)
		.values({ conferenceId: conference.id, name: 'People', position: 1 })
		.returning({ id: trackTable.id });

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId: conference.id, name: 'Plan' })
		.returning();
	[{ id: roundId }] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Screening' })
		.returning({ id: reviewRoundTable.id });
	[{ id: criterionId }] = await db
		.insert(scorecardCriterionTable)
		.values({ reviewRoundId: roundId, label: 'Overall', kind: 'rating', scaleMax: 5 })
		.returning({ id: scorecardCriterionTable.id });
});

beforeEach(async () => {
	for (const target of [conference, neighbour]) {
		await db.delete(submissionTable).where(eq(submissionTable.conferenceId, target.id));
	}
	await setSlotCapacity(conference.id, null, [
		{ id: platformTrackId, capacity: null },
		{ id: peopleTrackId, capacity: null }
	]);
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	for (const id of [ADA, BRUNO]) await db.delete(user).where(eq(user.id, id));
});

describe('the slot board', () => {
	it('counts accepted talks per track and keeps the untracked ones in the total', async () => {
		await addSubmission(conference, 'Accepted platform', 'accepted', platformTrackId);
		await addSubmission(conference, 'Also platform', 'accepted', platformTrackId);
		await addSubmission(conference, 'Accepted people', 'accepted', peopleTrackId);
		await addSubmission(conference, 'Accepted, no track', 'accepted', null);
		await addSubmission(conference, 'Still open', 'submitted', platformTrackId);
		await addSubmission(neighbour, 'Next door', 'accepted', null);

		const board = await slotBoard(conference.id);

		expect(board.total.accepted).toBe(4);
		expect(board.untracked).toBe(1);
		expect(board.tracks.map((t) => [t.name, t.accepted])).toEqual([
			['Platform', 2],
			['People', 1]
		]);
	});

	it('carries the capacities an organizer typed, and clears one back to unsaid', async () => {
		await setSlotCapacity(conference.id, 51, [{ id: platformTrackId, capacity: 20 }]);

		let board = await slotBoard(conference.id);
		expect(board.total.capacity).toBe(51);
		expect(board.tracks.find((t) => t.name === 'Platform')?.capacity).toBe(20);
		// Untouched by that call — a track not in the list keeps what it had.
		expect(board.tracks.find((t) => t.name === 'People')?.capacity).toBeNull();

		await setSlotCapacity(conference.id, null, [{ id: platformTrackId, capacity: null }]);
		board = await slotBoard(conference.id);
		expect(board.total.capacity).toBeNull();
		expect(board.tracks.find((t) => t.name === 'Platform')?.capacity).toBeNull();
	});

	it('will not write a track belonging to another conference', async () => {
		const [foreign] = await db
			.insert(trackTable)
			.values({ conferenceId: neighbour.id, name: 'Theirs', position: 0 })
			.returning();

		await setSlotCapacity(conference.id, 10, [{ id: foreign.id, capacity: 99 }]);

		const [row] = await db.select().from(trackTable).where(eq(trackTable.id, foreign.id));
		expect(row.slotCapacity).toBeNull();
	});
});

describe('a member’s lobbying queue', () => {
	it('ranks by their own score, not by the pooled average', async () => {
		const mine = await addSubmission(conference, 'Ada loves it', 'submitted', platformTrackId);
		const theirs = await addSubmission(conference, 'Bruno loves it', 'submitted', peopleTrackId);

		// Ada's ranking and the average disagree: Bruno's 5 pulls the second talk's
		// average above the first, and Ada must still see hers on top.
		await addReview(mine, ADA, 5);
		await addReview(mine, BRUNO, 1);
		await addReview(theirs, ADA, 2);
		await addReview(theirs, BRUNO, 5);

		const queue = await lobbyingQueue(conference.id, ADA);

		expect(queue.map((row) => row.title)).toEqual(['Ada loves it', 'Bruno loves it']);
		expect(queue[0].myScore).toBe(5);
		expect(queue[0].overallScore).toBe(3);
		expect(queue[0].reviewsSubmitted).toBe(2);
		expect(queue[0].submissionId).toBe(mine);
	});

	it('keeps what is still arguable and drops what is not', async () => {
		const accepted = await addSubmission(conference, 'Already in', 'accepted');
		const rejected = await addSubmission(conference, 'Rescue me', 'rejected');
		const withdrawn = await addSubmission(conference, 'Taken back', 'withdrawn');
		const draft = await addSubmission(conference, 'Never handed in', 'draft');
		for (const id of [accepted, rejected, withdrawn, draft]) await addReview(id, ADA, 4);

		const titles = (await lobbyingQueue(conference.id, ADA)).map((row) => row.title);

		// Accepted stays: the member has to see that their number two got in, or
		// they lobby for it again. Rejected stays because "rescue" is a verb here.
		expect(titles).toContain('Already in');
		expect(titles).toContain('Rescue me');
		// Withdrawn and draft are not on offer, so arguing about them is wasted call time.
		expect(titles).not.toContain('Taken back');
		expect(titles).not.toContain('Never handed in');
	});

	it('sinks an unscored review rather than sorting it as a zero', async () => {
		const scored = await addSubmission(conference, 'Scored', 'submitted');
		const blank = await addSubmission(conference, 'Comment only', 'submitted');
		await addReview(scored, ADA, 1);
		await addReview(blank, ADA, null);

		const queue = await lobbyingQueue(conference.id, ADA);

		expect(queue.map((row) => row.title)).toEqual(['Scored', 'Comment only']);
		expect(queue[1].myScore).toBeNull();
	});

	it('stays inside its own conference', async () => {
		const ours = await addSubmission(conference, 'Ours', 'submitted');
		await addReview(ours, ADA, 4);
		await addSubmission(neighbour, 'Theirs', 'submitted');

		const queue = await lobbyingQueue(conference.id, ADA);

		expect(queue.map((row) => row.title)).toEqual(['Ours']);
	});
});

describe('who is in the room', () => {
	it('seats the people who handed in a review, with the size of their queue', async () => {
		const one = await addSubmission(conference, 'One', 'submitted');
		const two = await addSubmission(conference, 'Two', 'submitted');
		await addReview(one, ADA, 4);
		await addReview(two, ADA, 3);
		await addReview(one, BRUNO, 2);

		const seats = await committeeSeats(conference.id);

		expect(seats.map((seat) => [seat.name, seat.queueLength])).toEqual([
			['Ada', 2],
			['Bruno', 1]
		]);
	});

	it('leaves out a reviewer who has only been assigned work', async () => {
		const one = await addSubmission(conference, 'One', 'submitted');
		await addReview(one, ADA, 4);
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId: one,
			reviewerUserId: BRUNO,
			status: 'assigned'
		});

		// An empty tab per absent name is how a screen built for a 40-minute call
		// becomes something you scroll past.
		expect((await committeeSeats(conference.id)).map((seat) => seat.name)).toEqual(['Ada']);
	});
});
