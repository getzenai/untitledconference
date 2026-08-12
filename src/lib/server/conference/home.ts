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
import { and, desc, eq, ne } from 'drizzle-orm';

/** Cap on each list so the hub stays a glance, not a second workspace. */
export const HOME_LIST_LIMIT = 6;

const OPEN_SUBMISSION_STATUSES = new Set(['draft', 'submitted', 'in_review']);

export type HomeOpenReview = {
	submissionId: number;
	title: string;
	conference: { slug: string; name: string };
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
		reviewConferences
	};
}

/**
 * Assigned reviews this user has not filed yet, across every conference.
 *
 * Built from `review` rows so a submission they were never assigned cannot appear.
 * Withdrawn talks stay out: the speaker took them back and no answer is wanted.
 */
async function openReviewsFor(userId: string): Promise<HomeOpenReview[]> {
	const rows = await db
		.select({
			submissionId: reviewTable.submissionId,
			title: submissionTable.title,
			submissionStatus: submissionTable.status,
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
				ne(submissionTable.status, 'withdrawn')
			)
		)
		.orderBy(desc(reviewTable.id));

	// One row per submission: a talk held in two rounds is one job on the hub.
	const seen = new Set<number>();
	const out: HomeOpenReview[] = [];
	for (const row of rows) {
		if (seen.has(row.submissionId)) continue;
		seen.add(row.submissionId);
		out.push({
			submissionId: row.submissionId,
			title: row.title,
			conference: { slug: row.conferenceSlug, name: row.conferenceName }
		});
	}
	return out;
}
