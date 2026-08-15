/**
 * The post-login hub: what this person can act on right now.
 *
 * `/home` is the first screen the eval harness (and a real organizer) sees after
 * sign-in. It used to be three static role cards and a starter leftover. The
 * hub answers four concrete questions instead:
 *
 * - Which events do I organize?
 * - Which proposals of mine are still open?
 * - Which reviews am I still expected to file?
 * - Can I jump into speaker sourcing?
 *
 * Counts and short lists only — a dashboard that pretends to be every surface
 * is a second, worse navigation. Full lists live on `/manage`, `/portal`,
 * `/review`, and `/contacts`.
 */
import { byRoundWindowPriority, roundWindow, type RoundWindow } from '$lib/conference/round-window';
import { organizedConferences } from '$lib/server/conference/access';
import { organizerOrganizationIds } from '$lib/server/conference/contacts';
import { organizationForNewConference } from '$lib/server/conference/create-conference';
import { reviewedConferences } from '$lib/server/conference/reviewer';
import {
	mySubmissions,
	myTasks,
	type PortalSubmission,
	type PortalTask
} from '$lib/server/conference/speaker-portal';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';

/** Cap on each list so the hub stays a glance, not a second workspace. */
export const HOME_LIST_LIMIT = 6;

const OPEN_SUBMISSION_STATUSES = new Set(['draft', 'submitted', 'in_review']);

export type HomeOpenReview = {
	submissionId: number;
	title: string;
	conference: { slug: string; name: string };
	/** The round that still wants this reviewer's work — same rule as the queue (#464). */
	window: RoundWindow;
	/** How many reviews are already filed on it by anyone: 0 means nobody has looked. */
	reviewsFiled: number;
};

export type HomeDashboard = {
	events: Conference[];
	/** True when the user owns/admins an org and can start a conference. */
	canCreateEvent: boolean;
	/** True when the user can open the org-wide CRM at `/contacts`. */
	canSourcing: boolean;
	openSubmissions: PortalSubmission[];
	openTasks: PortalTask[];
	openReviews: HomeOpenReview[];
	/**
	 * What the short list is a sample of (#465).
	 *
	 * The hub shows six. Six with no denominator reads as "six is all there is",
	 * which is how a reviewer with 22 outstanding closed the tab. `filable` is the
	 * subset whose round is open — the number they can act on tonight.
	 */
	openReviewCounts: { total: number; filable: number };
	/** Review conferences the user sits on (for a "go review" jump when none pending). */
	reviewConferences: Conference[];
};

/**
 * Everything `/home` needs in one call. Parallel where the queries are independent.
 */
export async function loadHomeDashboard(userId: string): Promise<HomeDashboard> {
	const [events, canCreateOrg, orgIds, submissions, tasks, reviewConferences, openReviews] =
		await Promise.all([
			organizedConferences(userId),
			organizationForNewConference(userId),
			organizerOrganizationIds(userId),
			mySubmissions(userId),
			myTasks(userId),
			reviewedConferences(userId),
			openReviewsFor(userId)
		]);

	const openSubmissions = submissions
		.filter((s) => OPEN_SUBMISSION_STATUSES.has(s.status))
		.slice(0, HOME_LIST_LIMIT);

	const openTasks = tasks.filter((t) => t.status === 'open').slice(0, HOME_LIST_LIMIT);

	return {
		events,
		canCreateEvent: canCreateOrg !== null,
		canSourcing: orgIds.length > 0,
		openSubmissions,
		openTasks,
		openReviews: openReviews.slice(0, HOME_LIST_LIMIT),
		openReviewCounts: {
			total: openReviews.length,
			filable: openReviews.filter((r) => r.window.state === 'open').length
		},
		reviewConferences
	};
}

/**
 * Assigned reviews this user has not filed yet, across every conference.
 *
 * Built from `review` rows so a submission they were never assigned cannot appear.
 * Withdrawn talks stay out: the speaker took them back and no answer is wanted.
 * Drafts stay out too (#614): they have not been handed in, even if a review
 * row already exists for when they are.
 */
async function openReviewsFor(userId: string): Promise<HomeOpenReview[]> {
	const rows = await db
		.select({
			submissionId: reviewTable.submissionId,
			title: submissionTable.title,
			submissionStatus: submissionTable.status,
			opensAt: reviewRoundTable.opensAt,
			closesAt: reviewRoundTable.closesAt,
			conferenceSlug: conferenceTable.slug,
			conferenceName: conferenceTable.name
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(conferenceTable, eq(conferenceTable.id, evaluationPlanTable.conferenceId))
		.innerJoin(submissionTable, eq(submissionTable.id, reviewTable.submissionId))
		.where(
			and(
				eq(reviewTable.reviewerUserId, userId),
				eq(reviewTable.status, 'assigned'),
				ne(submissionTable.status, 'withdrawn'),
				ne(submissionTable.status, 'draft')
			)
		)
		.orderBy(desc(reviewTable.id));

	// One row per submission: a talk held in two rounds is one job on the hub. Which
	// of those rounds speaks is the queue's rule (#464) — every row here is already
	// outstanding, so among them the window order decides.
	const bySubmission = new Map<number, (typeof rows)[number]>();
	for (const row of rows) {
		const held = bySubmission.get(row.submissionId);
		if (
			!held ||
			byRoundWindowPriority(
				roundWindow(row.opensAt, row.closesAt),
				roundWindow(held.opensAt, held.closesAt)
			) < 0
		) {
			bySubmission.set(row.submissionId, row);
		}
	}

	const filed = await filedReviewCounts([...bySubmission.keys()]);

	return [...bySubmission.values()]
		.map((row) => ({
			submissionId: row.submissionId,
			title: row.title,
			conference: { slug: row.conferenceSlug, name: row.conferenceName },
			window: roundWindow(row.opensAt, row.closesAt),
			reviewsFiled: filed.get(row.submissionId) ?? 0
		}))
		.sort(byUrgency);
}

/**
 * Which six of twenty-two the hub shows (#465).
 *
 * It used to be the six highest review ids — an accident of insertion order — so
 * the proposals nobody had looked at yet were missing and a round that opens next
 * week could take a slot. Urgency here means: what can be filed at all, then what
 * nobody else has covered, then the oldest assignment. A short list is a
 * recommendation whether or not it admits to being one.
 */
function byUrgency(a: HomeOpenReview, b: HomeOpenReview): number {
	const priority = byRoundWindowPriority(a.window, b.window);
	if (priority !== 0) return priority;
	if (a.reviewsFiled !== b.reviewsFiled) return a.reviewsFiled - b.reviewsFiled;
	return a.submissionId - b.submissionId;
}

/** Reviews already filed on each submission, by anyone — the coverage the row shows. */
async function filedReviewCounts(submissionIds: number[]): Promise<Map<number, number>> {
	if (submissionIds.length === 0) return new Map();

	const rows = await db
		.select({ submissionId: reviewTable.submissionId, filed: count(reviewTable.id) })
		.from(reviewTable)
		.where(
			and(inArray(reviewTable.submissionId, submissionIds), eq(reviewTable.status, 'submitted'))
		)
		.groupBy(reviewTable.submissionId);

	return new Map(rows.map((row) => [row.submissionId, Number(row.filed)]));
}
