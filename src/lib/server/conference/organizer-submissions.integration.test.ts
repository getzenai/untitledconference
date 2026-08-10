/**
 * Pagination is the one feature whose bugs are invisible on the screen that has it:
 * every page looks plausible on its own. What has to be checked against a real
 * database is that the pages together are the whole pile, exactly once — and that the
 * count the header shows is the filter's count, not the page's.
 *
 * Sorting by score (ABS-10) is here for the same reason twice over: the order has to
 * be right ACROSS pages, and the SQL that produces it is a second implementation of
 * `submissionScore` that only a database can be asked whether it still agrees.
 */
import { csvFile } from '$lib/conference/csv';
import { formatScore, submissionScore } from '$lib/conference/scoring';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportSubmissions, listSubmissions, PAGE_SIZE } from './organizer-submissions';
import { parseSort } from './submission-sort';

const suffix = `paging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let other: Conference;

/** A submitted talk. `submittedAt` differs per row so the order is not accidental. */
async function addSubmission(target: Conference, title: string, minute: number) {
	await db.insert(submissionTable).values({
		conferenceId: target.id,
		title,
		status: 'submitted',
		submittedAt: new Date(Date.UTC(2027, 2, 1, 12, minute))
	});
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Paging Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Paging Conf', slug: suffix })
		.returning();

	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();
});

beforeEach(async () => {
	for (const target of [conference, other]) {
		await db.delete(submissionTable).where(eq(submissionTable.conferenceId, target.id));
	}
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('the submissions table, page by page', () => {
	it('serves every row exactly once across its pages', async () => {
		const total = PAGE_SIZE + 7;
		for (let i = 0; i < total; i++) await addSubmission(conference, `Talk ${i}`, i);

		const first = await listSubmissions(conference.id, {}, 1);
		const second = await listSubmissions(conference.id, {}, 2);

		expect(first.rows).toHaveLength(PAGE_SIZE);
		expect(second.rows).toHaveLength(7);
		expect(first.pageCount).toBe(2);

		// The union is the pile and the intersection is empty — the two ways
		// pagination goes wrong, checked separately.
		const titles = [...first.rows, ...second.rows].map((r) => r.title);
		expect(new Set(titles).size).toBe(total);
	});

	it('counts what the filter matches, not what the page shows', async () => {
		for (let i = 0; i < PAGE_SIZE + 5; i++)
			await addSubmission(conference, `Deep learning ${i}`, i);
		await addSubmission(conference, 'Something else', 99);
		await addSubmission(other, 'Deep learning next door', 1);

		const page = await listSubmissions(conference.id, { q: 'Deep learning' }, 1);

		expect(page.rows).toHaveLength(PAGE_SIZE);
		// PAGE_SIZE + 5 here; the neighbouring conference's match is not ours to count.
		expect(page.matching).toBe(PAGE_SIZE + 5);
	});

	it('serves the last page when the URL asks for one past the end', async () => {
		for (let i = 0; i < PAGE_SIZE + 3; i++) await addSubmission(conference, `Talk ${i}`, i);

		const page = await listSubmissions(conference.id, {}, 9000);

		// An empty table under a filter that plainly matches something reads as data
		// loss, so the request is clamped rather than honoured.
		expect(page.page).toBe(2);
		expect(page.rows).toHaveLength(3);
	});

	it('reports one empty page rather than none when nothing matches', async () => {
		await addSubmission(conference, 'Only talk', 1);

		const page = await listSubmissions(conference.id, { q: 'nothing matches this' }, 1);

		expect(page.rows).toEqual([]);
		expect(page.matching).toBe(0);
		// Zero pages would make "page 1 of 0" the header of a screen that exists.
		expect(page.pageCount).toBe(1);
		expect(page.page).toBe(1);
	});

	it('keeps a stable order across pages when nothing was ever submitted', async () => {
		// Drafts have no submittedAt at all — the case where an unstable sort shows the
		// same row twice and hides another.
		const values = Array.from({ length: PAGE_SIZE + 4 }, (_, i) => ({
			conferenceId: conference.id,
			title: `Draft ${i}`,
			status: 'draft' as const
		}));
		await db.insert(submissionTable).values(values);

		const first = await listSubmissions(conference.id, {}, 1);
		const second = await listSubmissions(conference.id, {}, 2);
		const titles = [...first.rows, ...second.rows].map((r) => r.title);

		expect(new Set(titles).size).toBe(values.length);
	});
});

/**
 * Two criteria on different scales and different weights, so a wrong aggregate is
 * visible rather than coincidentally right: `1..5` at weight 1 and `1..10` at weight
 * 3 disagree about everything except a perfect card.
 */
const REVIEWERS = ['alice', 'bob', 'carol'].map((n) => `${n}-${suffix}`);

let relevanceId: number;
let depthId: number;

/** Files a review for a submission. `null` values are blanks the reviewer left. */
async function addReview(
	submissionId: number,
	reviewerUserId: string,
	{
		relevance,
		depth,
		submitted = true
	}: { relevance: number | null; depth: number | null; submitted?: boolean }
) {
	const [review] = await db
		.insert(reviewTable)
		.values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId,
			status: submitted ? 'submitted' : 'assigned',
			submittedAt: submitted ? new Date() : null
		})
		.returning();

	const scores = [
		{ criterion: relevanceId, value: relevance },
		{ criterion: depthId, value: depth }
	].filter((s) => s.value !== null);

	if (scores.length > 0) {
		await db.insert(reviewScoreTable).values(
			scores.map((s) => ({
				reviewId: review.id,
				scorecardCriterionId: s.criterion,
				valueNumber: String(s.value)
			}))
		);
	}
}

/** Scoped to the conference: the test database is shared, and titles are not unique. */
async function idFor(title: string) {
	const [row] = await db
		.select({ id: submissionTable.id })
		.from(submissionTable)
		.where(and(eq(submissionTable.conferenceId, conference.id), eq(submissionTable.title, title)));
	return row.id;
}

let roundId: number;

// Top-level rather than inside one `describe`: both the ordering suite and the
// export suite file reviews, and a fixture that only exists for the first of them
// leaves the second silently reviewing nothing.
beforeAll(async () => {
	for (const id of REVIEWERS) {
		await db.insert(user).values({
			id,
			name: id,
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId: conference.id, name: 'Plan' })
		.returning();
	const [round] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Round 1', position: 0 })
		.returning();
	roundId = round.id;

	const criteria = await db
		.insert(scorecardCriterionTable)
		.values([
			{ reviewRoundId: roundId, label: 'Relevance', kind: 'rating', scaleMax: 5, weight: '1' },
			{ reviewRoundId: roundId, label: 'Depth', kind: 'rating', scaleMax: 10, weight: '3' }
		])
		.returning();
	[relevanceId, depthId] = criteria.map((c) => c.id);
});

afterAll(async () => {
	for (const id of REVIEWERS) await db.delete(user).where(eq(user.id, id));
});

describe('ordering the table by score (ABS-10)', () => {
	it('orders the whole pile, not the page that happens to be on screen', async () => {
		// One more row than fits on a page, with the best score at the very bottom of
		// the default order. Sorting the page instead of the query would leave it on
		// page two, which is exactly the bug that looks fine in a screenshot.
		for (let i = 0; i < PAGE_SIZE + 1; i++) await addSubmission(conference, `Talk ${i}`, i);

		const best = await idFor(`Talk ${PAGE_SIZE}`);
		const middling = await idFor('Talk 0');
		await addReview(best, REVIEWERS[0], { relevance: 5, depth: 10 });
		await addReview(middling, REVIEWERS[0], { relevance: 3, depth: 5 });

		const page = await listSubmissions(conference.id, {}, 1, 'score-desc');

		expect(page.rows[0].id).toBe(best);
		expect(page.rows[0].score).toBe(5);
		expect(page.rows[1].id).toBe(middling);
	});

	it('agrees with the TypeScript that computes the number on screen', async () => {
		await addSubmission(conference, 'Weighted', 1);
		const id = await idFor('Weighted');

		// Two reviewers, one of whom left a criterion blank: reviewers count equally,
		// criteria do not, and a blank is not a zero.
		await addReview(id, REVIEWERS[0], { relevance: 4, depth: 8 });
		await addReview(id, REVIEWERS[1], { relevance: 2, depth: null });

		const [row] = (await listSubmissions(conference.id, {}, 1, 'score-desc')).rows;

		// The same arithmetic, done by hand: (0.8*1 + 0.8*3)/4 = 0.8 and 2/5 = 0.4,
		// mean 0.6, times five.
		expect(row.score).toBeCloseTo(3, 6);
		expect(row.score).toBeCloseTo(
			submissionScore([
				{
					submitted: true,
					scores: [
						{ value: 4, weight: 1, scaleMax: 5 },
						{ value: 8, weight: 3, scaleMax: 10 }
					]
				},
				{ submitted: true, scores: [{ value: 2, weight: 1, scaleMax: 5 }] }
			])!,
			6
		);
	});

	it('leaves the unreviewed at the end in both directions', async () => {
		await addSubmission(conference, 'Reviewed', 1);
		await addSubmission(conference, 'Never touched', 2);
		await addReview(await idFor('Reviewed'), REVIEWERS[0], { relevance: 1, depth: 1 });

		const down = await listSubmissions(conference.id, {}, 1, 'score-desc');
		const up = await listSubmissions(conference.id, {}, 1, 'score-asc');

		// A talk nobody has scored is not the worst talk — it is an unanswered
		// question, and it belongs at the end of both answers.
		expect(down.rows.map((r) => r.title)).toEqual(['Reviewed', 'Never touched']);
		expect(up.rows.map((r) => r.title)).toEqual(['Reviewed', 'Never touched']);
	});

	it('counts only the reviews that were actually filed', async () => {
		await addSubmission(conference, 'Half done', 1);
		const id = await idFor('Half done');

		await addReview(id, REVIEWERS[0], { relevance: 5, depth: 10 });
		// Still open on someone's desk: a draft verdict must not move the aggregate.
		await addReview(id, REVIEWERS[1], { relevance: 1, depth: 1, submitted: false });

		const [row] = (await listSubmissions(conference.id, {}, 1, 'score-desc')).rows;
		expect(row.score).toBe(5);
	});

	it('splits ties by id so the pages stay disjoint', async () => {
		for (let i = 0; i < PAGE_SIZE + 4; i++) await addSubmission(conference, `Tied ${i}`, i);

		const first = await listSubmissions(conference.id, {}, 1, 'score-desc');
		const second = await listSubmissions(conference.id, {}, 2, 'score-desc');
		const titles = [...first.rows, ...second.rows].map((r) => r.title);

		// Every row scores null here, which is the worst case for a sort with no
		// tiebreaker: Postgres may order an unstable set differently per query.
		expect(new Set(titles).size).toBe(PAGE_SIZE + 4);
	});

	it('reads an unknown sort as the default instead of failing', () => {
		expect(parseSort('score-asc')).toBe('score-asc');
		expect(parseSort('id; drop table')).toBe('newest');
		expect(parseSort(null)).toBe('newest');
	});
});

describe('exporting the table as a file (ABS-13)', () => {
	it('carries every matching row, not the fifty on screen', async () => {
		for (let i = 0; i < PAGE_SIZE + 12; i++) await addSubmission(conference, `Talk ${i}`, i);

		const { rows, truncated } = await exportSubmissions(conference.id);

		// The bug this guards is the one a spreadsheet cannot show you: a file that
		// looks complete and stops at the page boundary.
		expect(rows).toHaveLength(PAGE_SIZE + 12);
		expect(truncated).toBe(false);
	});

	it('honours the filter, and only the conference it was asked about', async () => {
		await addSubmission(conference, 'Deep learning here', 1);
		await addSubmission(conference, 'Something else', 2);
		await addSubmission(other, 'Deep learning next door', 3);

		const { rows } = await exportSubmissions(conference.id, { q: 'Deep learning' });

		expect(rows.map((r) => r.title)).toEqual(['Deep learning here']);
	});

	it('comes out in the order that was asked for, scores and all', async () => {
		await addSubmission(conference, 'Weak', 1);
		await addSubmission(conference, 'Strong', 2);
		await addReview(await idFor('Weak'), REVIEWERS[0], { relevance: 1, depth: 2 });
		await addReview(await idFor('Strong'), REVIEWERS[0], { relevance: 5, depth: 10 });

		const { rows } = await exportSubmissions(conference.id, {}, 'score-desc');

		expect(rows.map((r) => r.title)).toEqual(['Strong', 'Weak']);
		// The file and the screen read the same score off the same helper — this is the
		// assertion that keeps them from disagreeing in front of a committee.
		expect(rows[0].score).toBe(5);
	});
});

describe('the exported file itself', () => {
	it('is a spreadsheet that says what the table says', async () => {
		await addSubmission(conference, 'Testing, "briefly"', 1);
		await addReview(await idFor('Testing, "briefly"'), REVIEWERS[0], { relevance: 4, depth: 8 });

		const { rows } = await exportSubmissions(conference.id, {}, 'score-desc');
		const file = csvFile(
			['title', 'score'],
			rows.map((r) => [r.title, formatScore(r.score)])
		);

		// The comma and the quotes in the title are the whole point: the row must stay
		// one row, and the score must read as the table renders it.
		expect(file.trimEnd().split('\r\n')).toEqual([
			'\uFEFFtitle,score',
			'"Testing, ""briefly""",4.0'
		]);
	});
});
