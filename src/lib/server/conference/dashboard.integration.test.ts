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
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable, taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conferenceDashboard, MAX_ITEMS, TIMELINE_DAYS } from './dashboard';
import { decideSubmissions } from './decisions';

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

	// Acceptance generates the speaker's tasks from these, and the generated tasks are
	// the ones the leftovers strip is about.
	await db.insert(taskTemplateTable).values([
		{ conferenceId: conference.id, title: 'Upload slides', kind: 'file_request', dueOffsetDays: 7 },
		{ conferenceId: conference.id, title: 'Complete bio', kind: 'action', dueOffsetDays: 14 }
	]);

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

	/**
	 * The test that had to go through `decideSubmissions` instead of inserting rows.
	 *
	 * Inserting an open task on a declined talk tests a state the product never
	 * produces: taking the acceptance back DELETES exactly those. What survives an
	 * un-accept is what the speaker touched — so a strip that filters on `open` finds
	 * nothing after a real decline while promising the opposite in its own copy.
	 */
	it('surfaces the hand-ins that survive a real un-accept', async () => {
		const id = await addSubmission(conference, 'Accepted then declined', 'submitted');
		await db
			.insert(submissionSpeakerTable)
			.values({ submissionId: id, speakerProfileId, isPrimary: true, position: 0 });

		await decideSubmissions(conference, [id], 'accepted');

		// The speaker hands one of the generated tasks in; the other stays open.
		const generated = await db
			.select({ id: taskTable.id })
			.from(taskTable)
			.where(eq(taskTable.submissionId, id))
			.orderBy(asc(taskTable.id));
		expect(generated.length).toBeGreaterThan(1);
		await db
			.update(taskTable)
			.set({ status: 'submitted' })
			.where(eq(taskTable.id, generated[0].id));

		const undone = await decideSubmissions(conference, [id], 'rejected');
		expect(undone.tasksRemoved).toBe(generated.length - 1);

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies.count).toBe(1);
		expect(inconsistencies.items[0]).toMatchObject({ id, kind: 'handed_in_work' });
		expect(inconsistencies.items[0].detail).toContain('1 hand-in');
	});

	it('keeps hand-typed tasks as their own case, because the fix is different', async () => {
		const declined = await addSubmission(conference, 'Declined with homework', 'rejected');
		await db.insert(taskTable).values([
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Call the sponsor'
			},
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Return the badge'
			},
			// Finished work on a talk that is not happening is archive, not a to-do.
			{
				conferenceId: conference.id,
				speakerProfileId,
				submissionId: declined,
				title: 'Handed in and approved',
				status: 'done'
			}
		]);

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies.count).toBe(1);
		expect(inconsistencies.items[0]).toMatchObject({ id: declined, kind: 'open_tasks' });
		expect(inconsistencies.items[0].detail).toContain('2 tasks an organizer added by hand');
	});

	it('says nothing about a submission nobody has decided yet', async () => {
		// `!= accepted` would list this as a leftover and send the organizer looking
		// for a mistake that has not been made.
		const waiting = await addSubmission(conference, 'Still in the queue', 'submitted');
		await db
			.insert(placementTable)
			.values({ conferenceId: conference.id, submissionId: waiting, status: 'confirmed' });

		const { inconsistencies } = await conferenceDashboard(conference.id, NOW);

		expect(inconsistencies).toMatchObject({ count: 0, items: [] });
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

/**
 * The submissions chart. Two things can go wrong here and neither shows up in a
 * type: the window can silently include a neighbouring conference, and the quiet
 * days can go missing — which turns a fortnight of silence into a tick on the axis
 * and makes a flat month look like a steady climb.
 */
describe('submissions over time', () => {
	const dayOf = (offset: number) =>
		new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	beforeEach(async () => {
		// Two on the same day, one a week back, one outside the window, and one on
		// the neighbouring conference on a day this one is quiet.
		const stamp = async (target: Conference, title: string, at: Date) => {
			const [row] = await db
				.insert(submissionTable)
				.values({ conferenceId: target.id, title, status: 'submitted', submittedAt: at })
				.returning();
			await db.update(submissionTable).set({ createdAt: at }).where(eq(submissionTable.id, row.id));
		};

		await stamp(conference, 'Today one', NOW);
		await stamp(conference, 'Today two', new Date(NOW.getTime() - 60 * 60 * 1000));
		await stamp(conference, 'A week back', new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000));
		await stamp(conference, 'Too old', new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000));
		await stamp(other, 'Neighbour', new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000));
	});

	it('counts this conference per day and keeps the quiet days as zeroes', async () => {
		const { submissionsOverTime: days } = await conferenceDashboard(conference.id, NOW);

		// One row per day, contiguous, oldest first — no gaps to misread.
		expect(days).toHaveLength(TIMELINE_DAYS);
		expect(days[0].day).toBe(dayOf(-(TIMELINE_DAYS - 1)));
		expect(days[days.length - 1].day).toBe(dayOf(0));

		const on = (offset: number) => days.find((d) => d.day === dayOf(offset))?.count;
		console.log('DEBUG', JSON.stringify(days.filter((d) => d.count > 0)));
		expect(on(0)).toBe(2);
		expect(on(-7)).toBe(1);

		// The neighbour's submission falls on a day this conference had none. If the
		// scoping leaked it would read as 1 here, and nowhere else in the snapshot.
		expect(on(-3)).toBe(0);

		// Everything outside the window is dropped rather than piled onto the first day.
		expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3);
	});
});
