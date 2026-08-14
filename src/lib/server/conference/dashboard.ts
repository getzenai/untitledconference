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
import { callWindow } from '$lib/conference/call-window';
import { dashboardMode, type DashboardMode } from '$lib/conference/dashboard-mode';
import { classifyAcceptedTalk, type PlacementSlot } from '$lib/conference/program-states';
import { db } from '$lib/server/db';
import {
	cfpFormTable,
	submissionTable,
	type Submission
} from '$lib/server/db/conference/cfp-schema';
import {
	roomTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import {
	and,
	asc,
	count,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	sql,
	type SQLWrapper
} from 'drizzle-orm';
import { reviewerProgress, type ReviewerProgress } from './review-management';

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
	/** `unplaced` = no slot (missing row or tray). `tentative` = draft on the grid. */
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
	error: string | null;
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
	kind: 'confirmed_placement' | 'handed_in_work' | 'open_tasks';
	detail: string;
};

/**
 * One day on the submissions chart.
 *
 * Days with no submissions are present with a zero rather than missing: a time
 * axis that only carries the days something happened compresses a quiet fortnight
 * into a tick and makes a flat month look like a steady climb.
 */
export type SubmissionDay = {
	/** Calendar day in UTC, `YYYY-MM-DD`. */
	day: string;
	count: number;
};

/** How far back the submissions chart looks. */
export const TIMELINE_DAYS = 30;

export type DashboardSetup = {
	rooms: number;
	tracks: number;
	cfpOpen: boolean;
	submissions: number;
};

export type DashboardSnapshot = {
	/** `setup` while `submissions === 0`; see `dashboardMode`. */
	mode: DashboardMode;
	setup: DashboardSetup;
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
	reviews: {
		assigned: number;
		submitted: number;
		outstanding: number;
		items: ReviewerProgress[];
	};
	inconsistencies: {
		count: number;
		items: InconsistencyItem[];
	};
	submissionsOverTime: SubmissionDay[];
};

/** Everything the landing page shows, in one call. */
export async function conferenceDashboard(
	conferenceId: number,
	at: Date = new Date()
): Promise<DashboardSnapshot> {
	const [setup, decisions, scheduling, tasks, mail, reviews, inconsistencies, submissionsOverTime] =
		await Promise.all([
			setupState(conferenceId, at),
			decisionQueue(conferenceId),
			schedulingGap(conferenceId),
			taskLoad(conferenceId, at),
			mailQueue(conferenceId),
			reviewerLoad(conferenceId),
			leftovers(conferenceId),
			submissionTimeline(conferenceId, at)
		]);

	return {
		mode: dashboardMode(setup.submissions),
		setup,
		decisions,
		scheduling,
		tasks,
		mail,
		reviews,
		inconsistencies,
		submissionsOverTime
	};
}

/**
 * The three setup steps the create form already names, plus the count that
 * decides whether this snapshot is still that screen.
 *
 * CFP is open the same way a submitter would see it: a published form whose
 * window includes `at`. No form, a draft, or a closed window is closed.
 */
async function setupState(conferenceId: number, at: Date): Promise<DashboardSetup> {
	const [[rooms], [tracks], [submissions], [form]] = await Promise.all([
		db.select({ n: count() }).from(roomTable).where(eq(roomTable.conferenceId, conferenceId)),
		db.select({ n: count() }).from(trackTable).where(eq(trackTable.conferenceId, conferenceId)),
		db
			.select({ n: count() })
			.from(submissionTable)
			.where(eq(submissionTable.conferenceId, conferenceId)),
		db
			.select({
				status: cfpFormTable.status,
				opensAt: cfpFormTable.opensAt,
				closesAt: cfpFormTable.closesAt
			})
			.from(cfpFormTable)
			.where(eq(cfpFormTable.conferenceId, conferenceId))
			.orderBy(asc(cfpFormTable.id))
			.limit(1)
	]);

	const cfpOpen = form
		? callWindow(form.opensAt, form.closesAt, form.status !== 'published', at) === 'open'
		: false;

	return {
		rooms: Number(rooms?.n ?? 0),
		tracks: Number(tracks?.n ?? 0),
		cfpOpen,
		submissions: Number(submissions?.n ?? 0)
	};
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
				inArray(reviewTable.submissionId, submissionIds),
				ne(reviewTable.status, 'recused')
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

/** Review work grouped by the person who owes it (ABS-08). */
async function reviewerLoad(conferenceId: number): Promise<DashboardSnapshot['reviews']> {
	const items = await reviewerProgress(conferenceId);
	return {
		assigned: items.reduce((total, reviewer) => total + reviewer.assigned, 0),
		submitted: items.reduce((total, reviewer) => total + reviewer.submitted, 0),
		outstanding: items.reduce((total, reviewer) => total + reviewer.outstanding, 0),
		items
	};
}

/**
 * Accepted talks that are not published — the gap between "yes" and "the public
 * can see it". Split on the slot, same line the agenda tray already draws:
 *
 *   unplaced  — no placement, or a placement with no day/time/room
 *   tentative — draft: tentative *with* a slot (white card on the grid)
 *
 * Accepting writes a tentative row with no slot, so the state after a decision
 * round is N unplaced, not N drafts. A talk with no row at all fell out of
 * that process; it still needs a slot, so it sits in the same box.
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
					.select({
						submissionId: placementTable.submissionId,
						status: placementTable.status,
						kind: placementTable.kind,
						dayId: placementTable.conferenceDayId,
						roomId: placementTable.roomId,
						startsAt: placementTable.startsAt
					})
					.from(placementTable)
					.where(
						and(
							eq(placementTable.conferenceId, conferenceId),
							inArray(placementTable.submissionId, ids)
						)
					);

	const bySubmission = new Map<number, PlacementSlot[]>();
	for (const p of placements) {
		if (p.submissionId === null) continue;
		const list = bySubmission.get(p.submissionId) ?? [];
		list.push(p);
		bySubmission.set(p.submissionId, list);
	}

	const items: SchedulingItem[] = [];
	for (const a of accepted) {
		const state = classifyAcceptedTalk(bySubmission.get(a.id) ?? []);
		if (state === 'published') continue;
		items.push({ ...a, state: state === 'draft' ? 'tentative' : 'unplaced' });
	}

	return {
		accepted: accepted.length,
		unplaced: items.filter((i) => i.state === 'unplaced').length,
		tentative: items.filter((i) => i.state === 'tentative').length,
		// Unplaced first: a talk with no slot is further from done than a draft.
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
				error: emailLogTable.error,
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
	const [stuckSessions, handedIn, manual] = await Promise.all([
		confirmedButNotAccepted(conferenceId),
		handedInWorkOnDecidedTalks(conferenceId),
		manualTasksOnDecidedTalks(conferenceId)
	]);

	const items: InconsistencyItem[] = [
		...stuckSessions.map((s) => ({
			...s,
			kind: 'confirmed_placement' as const,
			detail: 'still holds a confirmed slot in the agenda'
		})),
		...handedIn.map((s) => ({
			id: s.id,
			title: s.title,
			status: s.status,
			kind: 'handed_in_work' as const,
			detail: `still holds ${plural(s.tasks, 'hand-in')} from the speaker`
		})),
		...manual.map((s) => ({
			id: s.id,
			title: s.title,
			status: s.status,
			kind: 'open_tasks' as const,
			detail: `still asks the speaker for ${plural(s.tasks, 'task')} an organizer added by hand`
		}))
	];

	return { count: items.length, items: items.slice(0, MAX_ITEMS) };
}

const plural = (n: number | string, word: string) =>
	`${Number(n)} ${word}${Number(n) === 1 ? '' : 's'}`;

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
				decidedAgainst(conferenceId)
			)
		);
}

/**
 * Work the speaker already handed in for a talk that is no longer happening.
 *
 * This is the half that a `status = 'open'` filter would never find, and finding it is
 * the entire promise of the strip: taking an acceptance back DELETES the open template
 * tasks, so what survives is by definition what the speaker has touched. `submitted`
 * only — a `done` deliverable on a declined talk is archive, not a to-do, and putting
 * it here would turn a list of things to fix into a list of things that happened.
 */
function handedInWorkOnDecidedTalks(conferenceId: number) {
	return decidedTalkTasks(conferenceId, [
		eq(taskTable.status, 'submitted'),
		isNotNull(taskTable.templateId)
	]);
}

/**
 * Tasks an organizer typed by hand, which acceptance never generated and taking it
 * back therefore never removed. Separate from the hand-ins because the fix is
 * different: this one is somebody's own text to withdraw.
 */
function manualTasksOnDecidedTalks(conferenceId: number) {
	return decidedTalkTasks(conferenceId, [
		eq(taskTable.status, 'open'),
		isNull(taskTable.templateId)
	]);
}

function decidedTalkTasks(conferenceId: number, extra: SQLWrapper[]) {
	return db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			tasks: count()
		})
		.from(taskTable)
		.innerJoin(submissionTable, eq(submissionTable.id, taskTable.submissionId))
		.where(and(eq(taskTable.conferenceId, conferenceId), decidedAgainst(conferenceId), ...extra))
		.groupBy(submissionTable.id, submissionTable.title, submissionTable.status);
}

/**
 * Talks that have been decided against.
 *
 * Named statuses rather than `!= 'accepted'`: a draft or an undecided submission is
 * not "wrong" to have no answer yet, and listing one under leftovers would send the
 * organizer looking for a mistake that has not been made.
 */
const decidedAgainst = (conferenceId: number) =>
	and(
		eq(submissionTable.conferenceId, conferenceId),
		inArray(submissionTable.status, ['rejected', 'waitlisted', 'withdrawn'])
	);

/**
 * Submissions per day over the last `TIMELINE_DAYS`, oldest first.
 *
 * Grouped in SQL and then zero-filled in JS, which is the division of labour the
 * rest of this file uses: the database counts, the caller never scans. Postgres
 * only returns the days that have rows, and the gaps are exactly the information
 * the chart needs — a call that went quiet for a week has to look quiet.
 *
 * Buckets are UTC calendar days. An organizer in Berlin submitting at 00:30 local
 * lands on the previous day; for a shape-over-weeks chart that is a rounding
 * detail, and one fixed rule beats a per-viewer one that makes two people
 * disagree about the same chart.
 *
 * `createdAt`, not `submittedAt`: a draft that was started counts as activity on
 * the call, and `submittedAt` is null until it is sent — the difference would show
 * up as a chart that is empty while the CFP is visibly busy.
 */
async function submissionTimeline(conferenceId: number, at: Date): Promise<SubmissionDay[]> {
	const day = sql<string>`to_char(${submissionTable.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

	// The first day of the window, at midnight UTC, so the SQL bound and the
	// zero-fill below agree about where the chart starts. The bound narrows the
	// scan; it is not what makes the window right — anything older than `start`
	// has no key in the array below and is dropped there regardless.
	const start = new Date(
		Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - (TIMELINE_DAYS - 1))
	);

	const rows = await db
		.select({ day, total: count() })
		.from(submissionTable)
		.where(
			and(eq(submissionTable.conferenceId, conferenceId), gte(submissionTable.createdAt, start))
		)
		.groupBy(day);

	const counted = new Map(rows.map((row) => [row.day, row.total]));

	return Array.from({ length: TIMELINE_DAYS }, (_, i) => {
		const date = new Date(start);
		date.setUTCDate(date.getUTCDate() + i);
		const key = date.toISOString().slice(0, 10);
		return { day: key, count: counted.get(key) ?? 0 };
	});
}
