/**
 * What needs attention on this conference right now (journey 2, step 10).
 *
 * The submissions table answers "what is there". This answers "what is stuck", and
 * that is a different question: a queue of 30 rows all in `submitted` looks calm in
 * a table and is a week of work. Every section here is one sentence an organizer
 * would otherwise have to assemble by filtering the table four times.
 *
 * Two rules the whole file follows:
 *
 * - **Counts are true, lists are short.** Each section reports the real count and at
 *   most `MAX_ITEMS` examples. A dashboard that silently shows five of forty is a
 *   dashboard that lies about how much work is left.
 * - **Everything is scoped by `conferenceId` in SQL**, never by filtering afterwards.
 *   This runs on every visit to the organizer's landing page; it may not grow a term
 *   with the size of the tables.
 */
import { db } from '$lib/server/db';
import { submissionTable, type Submission } from '$lib/server/db/conference/cfp-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, asc, count, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';

/** How many examples a section shows before it defers to the full list behind it. */
export const MAX_ITEMS = 5;

const UNDECIDED: Submission['status'][] = ['submitted', 'in_review'];

/** A talk waiting for a decision, with how far its reviews have got. */
export type DecisionQueueItem = {
	id: number;
	title: string;
	status: Submission['status'];
	submittedAt: Date | null;
	reviewsAssigned: number;
	reviewsSubmitted: number;
};

/** An accepted talk that is not on the grid yet. */
export type SchedulingItem = {
	id: number;
	title: string;
	/** `unplaced` = not even in the tray, `tentative` = in the tray, no confirmed slot. */
	state: 'unplaced' | 'tentative';
};

export type TaskItem = {
	id: number;
	title: string;
	speaker: string;
	dueOn: Date | null;
	overdue: boolean;
};

export type MailItem = {
	id: number;
	toEmail: string;
	subject: string;
	status: string;
	createdAt: Date;
};

/**
 * A leftover of a decision that was taken back.
 *
 * `decideSubmissions` deliberately refuses to delete a confirmed placement or a task
 * the speaker has already touched — a bulk click must not silently empty the grid or
 * throw away an upload. The cost of that decision is state that is visibly wrong, and
 * "visibly" only holds if some screen actually shows it. This is that screen.
 */
export type InconsistencyItem = {
	id: number;
	title: string;
	status: Submission['status'];
	kind: 'confirmed_placement' | 'open_tasks';
	detail: string;
};

export type DashboardSnapshot = {
	decisions: {
		undecided: number;
		unreviewed: number;
		items: DecisionQueueItem[];
	};
	scheduling: {
		accepted: number;
		unplaced: number;
		tentative: number;
		items: SchedulingItem[];
	};
	tasks: {
		open: number;
		overdue: number;
		dueSoon: number;
		items: TaskItem[];
	};
	mail: {
		queued: number;
		sent: number;
		failed: number;
		items: MailItem[];
	};
	inconsistencies: {
		count: number;
		items: InconsistencyItem[];
	};
};

/** Everything the landing page shows, in one call. */
export async function conferenceDashboard(
	conferenceId: number,
	at: Date = new Date()
): Promise<DashboardSnapshot> {
	const [decisions, scheduling, tasks, mail, inconsistencies] = await Promise.all([
		decisionQueue(conferenceId),
		schedulingGap(conferenceId),
		taskLoad(conferenceId, at),
		mailQueue(conferenceId),
		leftovers(conferenceId)
	]);

	return { decisions, scheduling, tasks, mail, inconsistencies };
}

/**
 * The talks nobody has decided on, oldest first.
 *
 * Oldest first rather than best first on purpose: this is a queue, and the submitter
 * who has been waiting three weeks is the one the conference owes an answer.
 */
async function decisionQueue(conferenceId: number): Promise<DashboardSnapshot['decisions']> {
	const waiting = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			submittedAt: submissionTable.submittedAt
		})
		.from(submissionTable)
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				inArray(submissionTable.status, UNDECIDED)
			)
		)
		.orderBy(asc(submissionTable.submittedAt), asc(submissionTable.id));

	const coverage = await reviewCoverage(
		conferenceId,
		waiting.map((w) => w.id)
	);

	const items = waiting.map((row) => ({
		...row,
		...(coverage.get(row.id) ?? { reviewsAssigned: 0, reviewsSubmitted: 0 })
	}));

	return {
		undecided: items.length,
		unreviewed: items.filter((i) => i.reviewsSubmitted === 0).length,
		items: items.slice(0, MAX_ITEMS)
	};
}

/**
 * Assigned and submitted review counts per submission.
 *
 * Joined through the evaluation plan so a review can only be counted for the
 * conference it was written in — reviewer assignments are per round, and rounds
 * belong to a plan, which is the only place the conference is recorded.
 */
async function reviewCoverage(conferenceId: number, submissionIds: number[]) {
	const byId = new Map<number, { reviewsAssigned: number; reviewsSubmitted: number }>();
	if (submissionIds.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: reviewTable.submissionId,
			assigned: count(),
			submitted: sql<number>`count(*) filter (where ${reviewTable.status} = 'submitted')`
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				inArray(reviewTable.submissionId, submissionIds)
			)
		)
		.groupBy(reviewTable.submissionId);

	for (const row of rows) {
		byId.set(row.submissionId, {
			reviewsAssigned: Number(row.assigned),
			reviewsSubmitted: Number(row.submitted)
		});
	}

	return byId;
}

/**
 * Accepted talks that are not on the grid yet — the gap between "yes" and "when".
 *
 * Accepting parks a tentative placement in the tray, so "in the tray" is the normal
 * state right after a decision round and not an error; a talk with no placement at
 * all is the one that fell out of the process.
 */
async function schedulingGap(conferenceId: number): Promise<DashboardSnapshot['scheduling']> {
	const accepted = await db
		.select({ id: submissionTable.id, title: submissionTable.title })
		.from(submissionTable)
		.where(
			and(eq(submissionTable.conferenceId, conferenceId), eq(submissionTable.status, 'accepted'))
		)
		.orderBy(asc(submissionTable.id));

	const ids = accepted.map((a) => a.id);
	const placements =
		ids.length === 0
			? []
			: await db
					.select({ submissionId: placementTable.submissionId, status: placementTable.status })
					.from(placementTable)
					.where(
						and(
							eq(placementTable.conferenceId, conferenceId),
							inArray(placementTable.submissionId, ids)
						)
					);

	const confirmed = new Set<number>();
	const parked = new Set<number>();
	for (const p of placements) {
		if (p.submissionId === null) continue;
		(p.status === 'confirmed' ? confirmed : parked).add(p.submissionId);
	}

	const items: SchedulingItem[] = accepted
		.filter((a) => !confirmed.has(a.id))
		.map((a) => ({
			...a,
			state: parked.has(a.id) ? ('tentative' as const) : ('unplaced' as const)
		}));

	return {
		accepted: accepted.length,
		unplaced: items.filter((i) => i.state === 'unplaced').length,
		tentative: items.filter((i) => i.state === 'tentative').length,
		// Unplaced first: a talk nobody has even parked is further from done.
		items: [...items]
			.sort((a, b) => (a.state === b.state ? 0 : a.state === 'unplaced' ? -1 : 1))
			.slice(0, MAX_ITEMS)
	};
}

/** Seven days is the horizon at which a speaker deadline is still worth a nudge. */
const DUE_SOON_DAYS = 7;

async function taskLoad(conferenceId: number, at: Date): Promise<DashboardSnapshot['tasks']> {
	const soon = new Date(at.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
	const open = and(eq(taskTable.conferenceId, conferenceId), eq(taskTable.status, 'open'));

	// ISO strings, not Date objects: inside a raw `sql` fragment there is no column to
	// take the timestamptz encoder from, and the driver refuses a bare Date. The cast
	// is what puts the type back.
	const now = sql`${at.toISOString()}::timestamptz`;
	const horizon = sql`${soon.toISOString()}::timestamptz`;

	const [[totals], items] = await Promise.all([
		db
			.select({
				open: count(),
				overdue: sql<number>`count(*) filter (where ${taskTable.dueOn} < ${now})`,
				dueSoon: sql<number>`count(*) filter (where ${taskTable.dueOn} >= ${now} and ${taskTable.dueOn} < ${horizon})`
			})
			.from(taskTable)
			.where(open),
		db
			.select({
				id: taskTable.id,
				title: taskTable.title,
				speaker: speakerProfileTable.name,
				dueOn: taskTable.dueOn
			})
			.from(taskTable)
			.innerJoin(speakerProfileTable, eq(speakerProfileTable.id, taskTable.speakerProfileId))
			// A task with no due date can never be late, so it is not what this card is about.
			.where(and(open, isNotNull(taskTable.dueOn), lt(taskTable.dueOn, soon)))
			.orderBy(asc(taskTable.dueOn), asc(taskTable.id))
			.limit(MAX_ITEMS)
	]);

	return {
		open: Number(totals?.open ?? 0),
		overdue: Number(totals?.overdue ?? 0),
		dueSoon: Number(totals?.dueSoon ?? 0),
		items: items.map((t) => ({ ...t, overdue: t.dueOn !== null && t.dueOn < at }))
	};
}

/**
 * The send log, which for this product IS the mail (see email-schema).
 *
 * `failed` is the number that matters — a queued mail is on its way, a failed one is
 * a speaker who never heard back and nobody noticed.
 */
async function mailQueue(conferenceId: number): Promise<DashboardSnapshot['mail']> {
	const scope = eq(emailLogTable.conferenceId, conferenceId);

	const [[totals], items] = await Promise.all([
		db
			.select({
				queued: sql<number>`count(*) filter (where ${emailLogTable.status} = 'queued')`,
				sent: sql<number>`count(*) filter (where ${emailLogTable.status} = 'sent')`,
				failed: sql<number>`count(*) filter (where ${emailLogTable.status} = 'failed')`
			})
			.from(emailLogTable)
			.where(scope),
		db
			.select({
				id: emailLogTable.id,
				toEmail: emailLogTable.toEmail,
				subject: emailLogTable.subject,
				status: emailLogTable.status,
				createdAt: emailLogTable.createdAt
			})
			.from(emailLogTable)
			.where(scope)
			.orderBy(sql`${emailLogTable.createdAt} desc`, sql`${emailLogTable.id} desc`)
			.limit(MAX_ITEMS)
	]);

	return {
		queued: Number(totals?.queued ?? 0),
		sent: Number(totals?.sent ?? 0),
		failed: Number(totals?.failed ?? 0),
		items
	};
}

/**
 * State that a taken-back acceptance left behind, on purpose (see `DecisionResult`).
 *
 * Both halves ask the same question from two sides: is there anything still treating
 * this talk as if it were happening, when the decision says it is not?
 */
async function leftovers(conferenceId: number): Promise<DashboardSnapshot['inconsistencies']> {
	const [stuckSessions, stuckTasks] = await Promise.all([
		confirmedButNotAccepted(conferenceId),
		openTasksOnDecidedTalks(conferenceId)
	]);

	const items: InconsistencyItem[] = [
		...stuckSessions.map((s) => ({
			...s,
			kind: 'confirmed_placement' as const,
			detail: 'still holds a confirmed slot in the agenda'
		})),
		...stuckTasks.map((s) => ({
			id: s.id,
			title: s.title,
			status: s.status,
			kind: 'open_tasks' as const,
			detail: `still has ${Number(s.open)} open speaker task${Number(s.open) === 1 ? '' : 's'}`
		}))
	];

	return { count: items.length, items: items.slice(0, MAX_ITEMS) };
}

/** The talk is not in the programme, but the grid still holds a slot for it. */
function confirmedButNotAccepted(conferenceId: number) {
	return db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status
		})
		.from(placementTable)
		.innerJoin(submissionTable, eq(submissionTable.id, placementTable.submissionId))
		.where(
			and(
				eq(placementTable.conferenceId, conferenceId),
				eq(placementTable.status, 'confirmed'),
				notAccepted(conferenceId)
			)
		);
}

/** The talk is not happening, but the speaker's portal still asks for work on it. */
function openTasksOnDecidedTalks(conferenceId: number) {
	return db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			open: count()
		})
		.from(taskTable)
		.innerJoin(submissionTable, eq(submissionTable.id, taskTable.submissionId))
		.where(
			and(
				eq(taskTable.conferenceId, conferenceId),
				eq(taskTable.status, 'open'),
				notAccepted(conferenceId)
			)
		)
		.groupBy(submissionTable.id, submissionTable.title, submissionTable.status);
}

const notAccepted = (conferenceId: number) =>
	and(eq(submissionTable.conferenceId, conferenceId), ne(submissionTable.status, 'accepted'));
