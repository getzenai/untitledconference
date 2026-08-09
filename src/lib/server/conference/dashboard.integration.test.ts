/**
 * The landing page is the one screen an organizer trusts without checking, so its
 * numbers have to be right in exactly the cases a type check cannot see: work that
 * belongs to a neighbouring conference, a count that disagrees with its own list, and
 * the leftovers a taken-back acceptance deliberately does not clean up.
 *
 * Every test therefore seeds a second conference in the same organization and expects
 * to see none of it.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conferenceDashboard, MAX_ITEMS } from './dashboard';

const suffix = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const REVIEWER = `reviewer-${suffix}`;

/** Fixed clock: "overdue" must not depend on when the suite happens to run. */
const NOW = new Date('2027-03-01T12:00:00.000Z');
const YESTERDAY = new Date('2027-02-28T12:00:00.000Z');
const IN_THREE_DAYS = new Date('2027-03-04T12:00:00.000Z');
const IN_A_MONTH = new Date('2027-04-01T12:00:00.000Z');

let conference: Conference;
let other: Conference;
let speakerProfileId: number;
let otherSpeakerProfileId: number;
let roundId: number;
let otherRoundId: number;

async function addSubmission(
	target: Conference,
	title: string,
	status: 'draft' | 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'waitlisted'
) {
	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId: target.id, title, status, submittedAt: NOW })
		.returning();
	return row.id;
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Dashboard Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: REVIEWER,
		name: 'Reviewer',
		email: `${REVIEWER}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();

	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();

	const speakers = await db
		.insert(speakerProfileTable)
		.values([
			{
				organizationId,
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: `priya-${suffix}@example.com`
			},
			{
				organizationId,
				name: 'Wei Ling Ng',
				sortName: 'Ng, Wei Ling',
				email: `wei-${suffix}@example.com`
			}
		])
		.returning();
	speakerProfileId = speakers[0].id;
	otherSpeakerProfileId = speakers[1].id;

	for (const target of [conference, other]) {
		const [plan] = await db
			.insert(evaluationPlanTable)
			.values({ conferenceId: target.id, name: 'Plan' })
			.returning();
		const [round] = await db
			.insert(reviewRoundTable)
			.values({ evaluationPlanId: plan.id, name: 'Round 1' })
			.returning();
		if (target.id === conference.id) roundId = round.id;
		else otherRoundId = round.id;
	}
});

beforeEach(async () => {
	for (const target of [conference, other]) {
		await db.delete(submissionTable).where(eq(submissionTable.conferenceId, target.id));
		await db.delete(taskTable).where(eq(taskTable.conferenceId, target.id));
		await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, target.id));
	}
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, REVIEWER));
});

describe('the decision queue', () => {
	it('counts what is undecided here and nothing from the conference next door', async () => {
		await addSubmission(conference, 'Taming 40-minute CI', 'submitted');
		await addSubmission(conference, 'Type-safe migrations', 'in_review');
		await addSubmission(conference, 'Already in', 'accepted');
		await addSubmission(conference, 'Never sent', 'draft');
		await addSubmission(other, 'Not yours', 'submitted');

		const { decisions } = await conferenceDashboard(conference.id, NOW);

		expect(decisions.undecided).toBe(2);
		expect(decisions.items.map((i) => i.title)).not.toContain('Not yours');
		expect(decisions.items.map((i) => i.title)).not.toContain('Never sent');
	});

	it('counts a review only for the conference whose plan it belongs to', async () => {
		const here = await addSubmission(conference, 'Reviewed here', 'submitted');
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId: here,
			reviewerUserId: REVIEWER,
			status: 'submitted'
		});

		// The same submission, assigned in the neighbouring conference's round. Nothing
		// stops that row from existing; the join through the plan is what stops it
		// from being counted twice.
		await db.insert(reviewTable).values({
			reviewRoundId: otherRoundId,
			submissionId: here,
			reviewerUserId: REVIEWER,
			status: 'submitted'
		});

		const { decisions } = await conferenceDashboard(conference.id, NOW);

		expect(decisions.items[0]).toMatchObject({ reviewsAssigned: 1, reviewsSubmitted: 1 });
		expect(decisions.unreviewed).toBe(0);
	});

	it('treats an assigned-but-unsaved review as no review at all', async () => {
		const id = await addSubmission(conference, 'Assigned only', 'submitted');
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId: id,
			reviewerUserId: REVIEWER,
			status: 'assigned'
		});

		const { decisions } = await conferenceDashboard(conference.id, NOW);

		expect(decisions.items[0]).toMatchObject({ reviewsAssigned: 1, reviewsSubmitted: 0 });
		expect(decisions.unreviewed).toBe(1);
	});

	it('reports the true count even when the list is capped', async () => {
		for (let i = 0; i < MAX_ITEMS + 3; i++) {
			await addSubmission(conference, `Talk ${i}`, 'submitted');
		}

		const { decisions } = await conferenceDashboard(conference.id, NOW);

		expect(decisions.undecided).toBe(MAX_ITEMS + 3);
		expect(decisions.items).toHaveLength(MAX_ITEMS);
	});
});

describe('the scheduling gap', () => {
	it('separates "not even parked" from "in the tray" and drops what is confirmed', async () => {
		const unplaced = await addSubmission(conference, 'Nowhere yet', 'accepted');
		const parked = await addSubmission(conference, 'In the tray', 'accepted');
		const scheduled = await addSubmission(conference, 'On the grid', 'accepted');

		await db.insert(placementTable).values([
			{ conferenceId: conference.id, submissionId: parked, status: 'tentative' },
			{ conferenceId: conference.id, submissionId: scheduled, status: 'confirmed' }
		]);

		const { scheduling } = await conferenceDashboard(conference.id, NOW);

		expect(scheduling).toMatchObject({ accepted: 3, unplaced: 1, tentative: 1 });
		expect(scheduling.items.map((i) => i.id)).toEqual([unplaced, parked]);
		expect(scheduling.items.map((i) => i.state)).toEqual(['unplaced', 'tentative']);
	});

	it('says nothing about talks that were never accepted', async () => {
		await addSubmission(conference, 'Still waiting', 'submitted');

		const { scheduling } = await conferenceDashboard(conference.id, NOW);

		expect(scheduling).toMatchObject({ accepted: 0, unplaced: 0, tentative: 0 });
		expect(scheduling.items).toEqual([]);
	});
});

describe('speaker tasks', () => {
	beforeEach(async () => {
		await db.insert(taskTable).values([
			{
				conferenceId: conference.id,
				speakerProfileId,
				title: 'Upload slides',
				dueOn: YESTERDAY
			},
			{
				conferenceId: conference.id,
				speakerProfileId,
				title: 'Complete bio',
				dueOn: IN_THREE_DAYS
			},
			{ conferenceId: conference.id, speakerProfileId, title: 'Travel form', dueOn: IN_A_MONTH },
			{ conferenceId: conference.id, speakerProfileId, title: 'No deadline', dueOn: null },
			{
				conferenceId: conference.id,
				speakerProfileId,
				title: 'Already handed in',
				dueOn: YESTERDAY,
				status: 'done'
			},
			{
				conferenceId: other.id,
				speakerProfileId: otherSpeakerProfileId,
				title: 'Not yours',
				dueOn: YESTERDAY
			}
		]);
	});

	it('counts open work by deadline and ignores what is done or elsewhere', async () => {
		const { tasks } = await conferenceDashboard(conference.id, NOW);

		expect(tasks).toMatchObject({ open: 4, overdue: 1, dueSoon: 1 });
		expect(tasks.items.map((t) => t.title)).toEqual(['Upload slides', 'Complete bio']);
		expect(tasks.items[0]).toMatchObject({ overdue: true, speaker: 'Priya Raman' });
		expect(tasks.items[1].overdue).toBe(false);
	});
});

describe('the send log', () => {
	it('reports queue, sent and failure separately, per conference', async () => {
		await db.insert(emailLogTable).values([
			{
				conferenceId: conference.id,
				toEmail: 'a@example.com',
				template: 'decision_accepted',
				subject: 'Accepted',
				status: 'queued'
			},
			{
				conferenceId: conference.id,
				toEmail: 'b@example.com',
				template: 'decision_rejected',
				subject: 'Declined',
				status: 'failed'
			},
			{
				conferenceId: other.id,
				toEmail: 'c@example.com',
				template: 'decision_accepted',
				subject: 'Not yours',
				status: 'sent'
			}
		]);

		const { mail } = await conferenceDashboard(conference.id, NOW);

		expect(mail).toMatchObject({ queued: 1, sent: 0, failed: 1 });
		expect(mail.items.map((m) => m.subject)).not.toContain('Not yours');
	});
});

describe('what a taken-back acceptance leaves behind', () => {
	it('surfaces a decided talk that still holds a confirmed slot', async () => {
		const declined = await addSubmission(conference, 'Declined but scheduled', 'rejected');
		const accepted = await addSubmission(conference, 'Properly scheduled', 'accepted');

		await db.insert(placementTable).values([
			{ conferenceId: conference.id, submissionId: declined, status: 'confirmed' },
			{ conferenceId: conference.id, submissionId: accepted, status: 'confirmed' }
		]);

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies.count).toBe(1);
		expect(inconsistencies.items[0]).toMatchObject({
			id: declined,
			kind: 'confirmed_placement',
			status: 'rejected'
		});
	});

	it('surfaces open speaker tasks on a talk that is no longer happening', async () => {
		const declined = await addSubmission(conference, 'Declined with homework', 'rejected');
		await db.insert(taskTable).values([
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Upload slides'
			},
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Complete bio'
			},
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Handed in already',
				status: 'done'
			}
		]);

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies.count).toBe(1);
		expect(inconsistencies.items[0]).toMatchObject({ id: declined, kind: 'open_tasks' });
		expect(inconsistencies.items[0].detail).toContain('2 open speaker tasks');
	});

	it('stays quiet when the programme agrees with the decisions', async () => {
		const accepted = await addSubmission(conference, 'All good', 'accepted');
		await db
			.insert(placementTable)
			.values({ conferenceId: conference.id, submissionId: accepted, status: 'confirmed' });
		await db.insert(taskTable).values({
			conferenceId: conference.id,
			speakerProfileId,
			submissionId: accepted,
			title: 'Upload slides'
		});

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies).toMatchObject({ count: 0, items: [] });
	});
});
