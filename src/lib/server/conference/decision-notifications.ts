/**
 * Explicitly notifying speakers about decisions.
 *
 * A decision changes the programme immediately; this module is the later, deliberate
 * act of telling people. The email log remains the observable delivery model while
 * keeping status changes free of outbound side effects.
 */
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { speakerProfileTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { emailLogTable, type EmailLog } from '$lib/server/db/conference/email-schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Decision } from './decisions';

const EMAIL_TEMPLATE: Record<Decision, string> = {
	accepted: 'decision_accepted',
	rejected: 'decision_rejected',
	waitlisted: 'decision_waitlisted'
};

const DECISIONS = new Set<Decision>(['accepted', 'rejected', 'waitlisted']);

export type DecisionNotificationStatus = EmailLog['status'] | null;

export type NotificationResult = {
	notified: number;
	alreadyNotified: number;
	notDecided: number;
	withoutEmail: number;
	emailsQueued: number;
};

const NOTHING_NOTIFIED: NotificationResult = {
	notified: 0,
	alreadyNotified: 0,
	notDecided: 0,
	withoutEmail: 0,
	emailsQueued: 0
};

function decision(value: string): Decision | null {
	return DECISIONS.has(value as Decision) ? (value as Decision) : null;
}

function subjectFor(value: Decision, conference: Conference): string {
	if (value === 'accepted') return `Your ${conference.name} submission was accepted`;
	if (value === 'waitlisted') return `Your ${conference.name} submission is on the waitlist`;
	return `About your ${conference.name} submission`;
}

function bodyFor(value: Decision, conference: Conference, title: string): string {
	if (value === 'accepted') {
		return `“${title}” is in the programme for ${conference.name}. Your speaker portal now lists what we need from you and when.`;
	}
	if (value === 'waitlisted') {
		return `“${title}” is on the waitlist for ${conference.name}. We will be in touch if a slot opens up.`;
	}
	return `We are not able to fit “${title}” into ${conference.name} this time. Thank you for submitting.`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NotificationTarget = {
	id: number;
	title: string;
	decision: Decision;
	decidedAt: Date | null;
};

type ExpectedNotification = { template: string; decidedAt: Date | null };

function visibleStatus(values: EmailLog['status'][]): EmailLog['status'] {
	if (values.includes('failed')) return 'failed';
	if (values.includes('queued')) return 'queued';
	return 'sent';
}

function expectedTemplates(submissions: { id: number; status: string; decidedAt?: Date | null }[]) {
	const statuses: Record<number, DecisionNotificationStatus> = {};
	const expected = new Map<number, ExpectedNotification>();
	for (const submission of submissions) {
		const current = decision(submission.status);
		statuses[submission.id] = null;
		if (current) {
			expected.set(submission.id, {
				template: EMAIL_TEMPLATE[current],
				decidedAt: submission.decidedAt ?? null
			});
		}
	}
	return { statuses, expected };
}

function isCurrentDecisionEmail(createdAt: Date, decidedAt: Date | null) {
	return decidedAt === null || createdAt >= decidedAt;
}

function applyStatuses(
	statuses: Record<number, DecisionNotificationStatus>,
	expected: Map<number, ExpectedNotification>,
	rows: {
		relatedId: number | null;
		template: string;
		toEmail: string;
		status: EmailLog['status'];
		createdAt: Date;
	}[]
) {
	const recipients = new Map<number, Map<string, EmailLog['status']>>();
	for (const row of rows) {
		if (row.relatedId === null) continue;
		const current = expected.get(row.relatedId);
		if (
			current === undefined ||
			current.template !== row.template ||
			!isCurrentDecisionEmail(row.createdAt, current.decidedAt)
		) {
			continue;
		}
		const recipientStatuses = recipients.get(row.relatedId) ?? new Map();
		recipientStatuses.set(row.toEmail, row.status);
		recipients.set(row.relatedId, recipientStatuses);
	}
	for (const [submissionId, recipientStatuses] of recipients) {
		statuses[submissionId] = visibleStatus([...recipientStatuses.values()]);
	}
}

/**
 * The notification state for the CURRENT decision on each submission.
 *
 * A previous acceptance email does not make a later decline look notified. Rows are
 * read in id order so a retry after a failed send becomes the visible current state.
 */
export async function decisionNotificationStatuses(
	conferenceId: number,
	submissions: { id: number; status: string; decidedAt?: Date | null }[]
): Promise<Record<number, DecisionNotificationStatus>> {
	const { statuses, expected } = expectedTemplates(submissions);
	if (expected.size === 0) return statuses;
	const rows = await db
		.select({
			id: emailLogTable.id,
			relatedId: emailLogTable.relatedId,
			template: emailLogTable.template,
			toEmail: emailLogTable.toEmail,
			status: emailLogTable.status,
			createdAt: emailLogTable.createdAt
		})
		.from(emailLogTable)
		.where(
			and(
				eq(emailLogTable.conferenceId, conferenceId),
				eq(emailLogTable.relatedType, 'submission'),
				inArray(emailLogTable.relatedId, [...expected.keys()]),
				inArray(emailLogTable.template, Object.values(EMAIL_TEMPLATE))
			)
		)
		.orderBy(emailLogTable.id);
	applyStatuses(statuses, expected, rows);
	return statuses;
}

async function targetsFor(tx: Tx, conferenceId: number, submissionIds: number[]) {
	const selected = await tx
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			decidedAt: submissionTable.decidedAt
		})
		.from(submissionTable)
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				inArray(submissionTable.id, submissionIds)
			)
		)
		// Two explicit clicks racing must not both observe "not sent" and queue
		// duplicates. A stable row-lock order also keeps bulk requests deadlock-free.
		.orderBy(asc(submissionTable.id))
		.for('update');
	const targets: NotificationTarget[] = [];
	for (const submission of selected) {
		const current = decision(submission.status);
		if (current) targets.push({ ...submission, decision: current });
	}
	return { targets, notDecided: selected.length - targets.length };
}

async function recipientEmails(tx: Tx, targetIds: number[]) {
	const speakers = await tx
		.select({ submissionId: submissionSpeakerTable.submissionId, email: speakerProfileTable.email })
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, targetIds));
	const bySubmission = new Map<number, Set<string>>();
	for (const speaker of speakers) {
		if (!speaker.email) continue;
		const recipients = bySubmission.get(speaker.submissionId) ?? new Set<string>();
		recipients.add(speaker.email);
		bySubmission.set(speaker.submissionId, recipients);
	}
	return bySubmission;
}

async function activeNotifications(tx: Tx, conferenceId: number, targets: NotificationTarget[]) {
	const targetIds = targets.map((target) => target.id);
	const decidedAt = new Map(targets.map((target) => [target.id, target.decidedAt]));
	const existing = await tx
		.select({
			relatedId: emailLogTable.relatedId,
			template: emailLogTable.template,
			toEmail: emailLogTable.toEmail,
			status: emailLogTable.status,
			createdAt: emailLogTable.createdAt
		})
		.from(emailLogTable)
		.where(
			and(
				eq(emailLogTable.conferenceId, conferenceId),
				eq(emailLogTable.relatedType, 'submission'),
				inArray(emailLogTable.relatedId, targetIds),
				inArray(emailLogTable.template, Object.values(EMAIL_TEMPLATE))
			)
		);
	return new Set(
		existing
			.filter(
				(mail) =>
					mail.relatedId !== null &&
					mail.status !== 'failed' &&
					isCurrentDecisionEmail(mail.createdAt, decidedAt.get(mail.relatedId) ?? null)
			)
			.map((mail) => `${mail.relatedId}:${mail.template}:${mail.toEmail}`)
	);
}

function buildMails(
	conference: Conference,
	targets: NotificationTarget[],
	recipientsBySubmission: Map<number, Set<string>>,
	active: Set<string>,
	result: NotificationResult
) {
	const mails: (typeof emailLogTable.$inferInsert)[] = [];
	const notified = new Set<number>();
	for (const target of targets) {
		const recipients = [...(recipientsBySubmission.get(target.id) ?? [])];
		if (recipients.length === 0) {
			result.withoutEmail += 1;
			continue;
		}
		const template = EMAIL_TEMPLATE[target.decision];
		for (const toEmail of recipients) {
			const key = `${target.id}:${template}:${toEmail}`;
			if (active.has(key)) continue;
			active.add(key);
			notified.add(target.id);
			mails.push({
				conferenceId: conference.id,
				toEmail,
				template,
				subject: subjectFor(target.decision, conference),
				bodyPreview: bodyFor(target.decision, conference, target.title),
				status: 'queued',
				relatedType: 'submission',
				relatedId: target.id
			});
		}
		if (!notified.has(target.id)) result.alreadyNotified += 1;
	}
	result.notified = notified.size;
	result.emailsQueued = mails.length;
	return mails;
}

async function queueNotifications(
	tx: Tx,
	conference: Conference,
	submissionIds: number[],
	result: NotificationResult
) {
	const selected = await targetsFor(tx, conference.id, submissionIds);
	result.notDecided = selected.notDecided;
	if (selected.targets.length === 0) return;
	const targetIds = selected.targets.map((target) => target.id);
	const recipients = await recipientEmails(tx, targetIds);
	const active = await activeNotifications(tx, conference.id, selected.targets);
	const mails = buildMails(conference, selected.targets, recipients, active, result);
	if (mails.length > 0) await tx.insert(emailLogTable).values(mails);
}

/**
 * Queues the CURRENT decisions for one or many submissions.
 *
 * Queued and sent rows are idempotent per recipient and decision occurrence. A
 * failed row may be retried; changing away from and later returning to a decision
 * starts a new occurrence even though it uses the same template again.
 */
export async function notifySubmissionDecisions(
	conference: Conference,
	submissionIds: number[]
): Promise<NotificationResult> {
	const result = { ...NOTHING_NOTIFIED };
	if (submissionIds.length === 0) return result;

	await db.transaction((tx) => queueNotifications(tx, conference, submissionIds, result));

	return result;
}
