/**
 * A saved verdict and a speaker notification are two observable, independently
 * repeatable actions. These tests use the send log as the product's mail evidence.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decisionNotificationStatuses, notifySubmissionDecisions } from './decision-notifications';
import { decideSubmissions, type Decision } from './decisions';

const suffix = `notify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let otherConference: Conference;
let speakerWithEmail: number;
let secondSpeaker: number;
let speakerWithoutEmail: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Notification Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Notification Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Notification Conf', slug: `${suffix}-other` })
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
				name: 'Robin Lee',
				sortName: 'Lee, Robin',
				email: `robin-${suffix}@example.com`
			},
			{
				organizationId,
				name: 'No Address',
				sortName: 'Address, No',
				email: null
			}
		])
		.returning({ id: speakerProfileTable.id });
	[speakerWithEmail, secondSpeaker, speakerWithoutEmail] = speakers.map((speaker) => speaker.id);
});

beforeEach(async () => {
	await db
		.delete(emailLogTable)
		.where(inArray(emailLogTable.conferenceId, [conference.id, otherConference.id]));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, otherConference.id));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

async function addSubmission(
	target: Conference,
	title: string,
	status: Decision | 'submitted',
	speakers: number[] = [speakerWithEmail]
) {
	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId: target.id, title, status })
		.returning();

	if (speakers.length > 0) {
		await db.insert(submissionSpeakerTable).values(
			speakers.map((speakerProfileId, position) => ({
				submissionId: submission.id,
				speakerProfileId,
				isPrimary: position === 0,
				position
			}))
		);
	}

	return submission;
}

async function currentSubmission(id: number) {
	const [submission] = await db
		.select({
			id: submissionTable.id,
			status: submissionTable.status,
			decidedAt: submissionTable.decidedAt
		})
		.from(submissionTable)
		.where(eq(submissionTable.id, id));
	return submission;
}

describe('explicit decision notifications', () => {
	it('leaves an acceptance unsent until the organizer explicitly notifies it', async () => {
		const submission = await addSubmission(conference, 'Deliberate release', 'submitted');
		await decideSubmissions(conference, [submission.id], 'accepted');

		expect(
			await decisionNotificationStatuses(conference.id, [{ id: submission.id, status: 'accepted' }])
		).toEqual({ [submission.id]: null });
		expect(
			await db.select().from(emailLogTable).where(eq(emailLogTable.conferenceId, conference.id))
		).toHaveLength(0);

		const result = await notifySubmissionDecisions(conference, [submission.id]);
		expect(result).toEqual({
			notified: 1,
			alreadyNotified: 0,
			notDecided: 0,
			withoutEmail: 0,
			emailsQueued: 1,
			dispatch: { sent: 0, failed: 0, remaining: 0, disabled: true }
		});

		const [email] = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submission.id));
		expect(email).toMatchObject({
			template: 'decision_accepted',
			status: 'queued',
			relatedType: 'submission'
		});

		const second = await notifySubmissionDecisions(conference, [submission.id]);
		expect(second).toMatchObject({ alreadyNotified: 1, emailsQueued: 0 });
		expect(
			await db.select().from(emailLogTable).where(eq(emailLogTable.relatedId, submission.id))
		).toHaveLength(1);
	});

	it('handles a mixed batch without notifying undecided, address-less or foreign rows', async () => {
		const accepted = await addSubmission(conference, 'Accepted', 'accepted', [
			speakerWithEmail,
			secondSpeaker
		]);
		const rejected = await addSubmission(conference, 'Rejected', 'rejected');
		const waitlisted = await addSubmission(conference, 'Waitlisted', 'waitlisted');
		const undecided = await addSubmission(conference, 'Undecided', 'submitted');
		const addressless = await addSubmission(conference, 'No address', 'accepted', [
			speakerWithoutEmail
		]);
		const foreign = await addSubmission(otherConference, 'Not yours', 'accepted');

		const result = await notifySubmissionDecisions(conference, [
			accepted.id,
			rejected.id,
			waitlisted.id,
			undecided.id,
			addressless.id,
			foreign.id
		]);

		expect(result).toEqual({
			notified: 3,
			alreadyNotified: 0,
			notDecided: 1,
			withoutEmail: 1,
			emailsQueued: 4,
			dispatch: { sent: 0, failed: 0, remaining: 0, disabled: true }
		});

		const emails = await db
			.select({ relatedId: emailLogTable.relatedId, template: emailLogTable.template })
			.from(emailLogTable)
			.where(eq(emailLogTable.conferenceId, conference.id));
		expect(emails.filter((email) => email.relatedId === accepted.id)).toHaveLength(2);
		expect(
			Object.fromEntries(emails.map((email) => [email.relatedId, email.template]))
		).toMatchObject({
			[accepted.id]: 'decision_accepted',
			[rejected.id]: 'decision_rejected',
			[waitlisted.id]: 'decision_waitlisted'
		});
		expect(emails.some((email) => email.relatedId === foreign.id)).toBe(false);
	});

	it('queues a decision only once when two explicit notification requests race', async () => {
		const submission = await addSubmission(conference, 'One deliberate send', 'accepted');

		const results = await Promise.all([
			notifySubmissionDecisions(conference, [submission.id]),
			notifySubmissionDecisions(conference, [submission.id])
		]);

		expect(results.map((result) => result.emailsQueued).sort()).toEqual([0, 1]);
		expect(results.map((result) => result.notified).sort()).toEqual([0, 1]);
		expect(results.map((result) => result.alreadyNotified).sort()).toEqual([0, 1]);
		expect(
			await db.select().from(emailLogTable).where(eq(emailLogTable.relatedId, submission.id))
		).toHaveLength(1);
	});

	it('retries failures and treats a changed decision as not notified', async () => {
		const submission = await addSubmission(conference, 'Change of mind', 'accepted');
		await notifySubmissionDecisions(conference, [submission.id]);
		await db
			.update(emailLogTable)
			.set({ status: 'failed', error: 'Provider unavailable' })
			.where(eq(emailLogTable.relatedId, submission.id));
		const [failed] = await db
			.select({ id: emailLogTable.id })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submission.id));

		expect(await decisionNotificationStatuses(conference.id, [submission])).toEqual({
			[submission.id]: 'failed'
		});

		const retried = await notifySubmissionDecisions(conference, [submission.id]);
		expect(retried).toMatchObject({
			notified: 1,
			emailsQueued: 1,
			dispatch: { disabled: true }
		});
		expect(await decisionNotificationStatuses(conference.id, [submission])).toEqual({
			[submission.id]: 'queued'
		});
		const acceptanceRows = await db
			.select({
				id: emailLogTable.id,
				status: emailLogTable.status,
				error: emailLogTable.error
			})
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submission.id));
		expect(acceptanceRows).toEqual([{ id: failed.id, status: 'queued', error: null }]);

		await db
			.update(submissionTable)
			.set({ status: 'rejected', decidedAt: new Date() })
			.where(
				and(eq(submissionTable.id, submission.id), eq(submissionTable.conferenceId, conference.id))
			);
		expect(
			await decisionNotificationStatuses(conference.id, [{ id: submission.id, status: 'rejected' }])
		).toEqual({ [submission.id]: null });

		await notifySubmissionDecisions(conference, [submission.id]);
		const emails = await db
			.select({ template: emailLogTable.template })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submission.id))
			.orderBy(emailLogTable.template);
		expect(emails.map((email) => email.template)).toEqual([
			'decision_accepted',
			'decision_rejected'
		]);
	});

	it('starts a fresh notification occurrence when a decision returns to an earlier value', async () => {
		const submission = await addSubmission(conference, 'Round-trip decision', 'submitted');

		await decideSubmissions(conference, [submission.id], 'accepted');
		await notifySubmissionDecisions(conference, [submission.id]);
		expect(
			await decisionNotificationStatuses(conference.id, [await currentSubmission(submission.id)])
		).toEqual({ [submission.id]: 'queued' });

		await decideSubmissions(conference, [submission.id], 'rejected');
		expect(
			await decisionNotificationStatuses(conference.id, [await currentSubmission(submission.id)])
		).toEqual({ [submission.id]: null });
		await notifySubmissionDecisions(conference, [submission.id]);

		await decideSubmissions(conference, [submission.id], 'accepted');
		expect(
			await decisionNotificationStatuses(conference.id, [await currentSubmission(submission.id)])
		).toEqual({ [submission.id]: null });
		const returnedAcceptance = await notifySubmissionDecisions(conference, [submission.id]);
		expect(returnedAcceptance).toMatchObject({ notified: 1, alreadyNotified: 0, emailsQueued: 1 });

		const emails = await db
			.select({ template: emailLogTable.template })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submission.id));
		expect(emails.map((email) => email.template)).toEqual([
			'decision_accepted',
			'decision_rejected',
			'decision_accepted'
		]);
	});
});
