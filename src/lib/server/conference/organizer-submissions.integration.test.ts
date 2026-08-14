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
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	exportSubmissions,
	listSubmissions,
	PAGE_SIZE,
	submissionDetail,
	submissionTotals
} from './organizer-submissions';
import { parseSort, scoreExpression } from './submission-sort';

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

	it('agrees with the TypeScript when the SQL itself is asked, not the order it produces', async () => {
		await addSubmission(conference, 'Asked directly', 1);
		const id = await idFor('Asked directly');
		// The two criteria must DISAGREE for the weights to be visible: 5/5 and 4/10
		// normalise to 1.0 and 0.4, so weighting them 1:3 gives 0.55 where an unweighted
		// mean gives 0.7. Equal normalised values (say 4/5 and 8/10) would make the two
		// formulas print the same number and the test would pin nothing.
		await addReview(id, REVIEWERS[0], { relevance: 5, depth: 4 });
		await addReview(id, REVIEWERS[1], { relevance: 2, depth: null });

		// The test above reads `row.score`, which `listSubmissions` computes in
		// TypeScript — it can agree with itself all day. This one selects the SQL
		// expression, the copy that can actually drift, and an ordering assertion
		// cannot substitute: with the weights dropped the rows still come out in the
		// same order, and every number on the screen is wrong.
		const rows = await db.execute<{ score: string | null }>(
			sql`select ${scoreExpression(conference.id)} as score
				from ${submissionTable}
				where ${submissionTable.id} = ${id}`
		);

		expect(Number(rows[0].score)).toBeCloseTo(
			submissionScore([
				{
					submitted: true,
					scores: [
						{ value: 5, weight: 1, scaleMax: 5 },
						{ value: 4, weight: 3, scaleMax: 10 }
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
		expect(parseSort('title-asc')).toBe('title-asc');
		expect(parseSort('title-desc')).toBe('title-desc');
		expect(parseSort('id; drop table')).toBe('newest');
		expect(parseSort(null)).toBe('newest');
	});

	/**
	 * A–Z, both ways, and mixed case on purpose.
	 *
	 * Honest limit, found by mutating the implementation: dropping the `lower(...)`
	 * from `orderFor` leaves this test green, because the database here collates
	 * `en_US.utf8` and already ignores case. The assertion below pins the direction
	 * and the tiebreaker — the two things that do break — not the collation guard.
	 */
	it('orders titles as a person reads an alphabet', async () => {
		await addSubmission(conference, 'banana talk', 1);
		await addSubmission(conference, 'Apple talk', 2);
		await addSubmission(conference, 'Cherry talk', 3);

		const up = await listSubmissions(conference.id, {}, 1, 'title-asc');
		expect(up.rows.map((r) => r.title)).toEqual(['Apple talk', 'banana talk', 'Cherry talk']);

		const down = await listSubmissions(conference.id, {}, 1, 'title-desc');
		expect(down.rows.map((r) => r.title)).toEqual(['Cherry talk', 'banana talk', 'Apple talk']);
	});

	it('keeps the title order stable across a page boundary', async () => {
		// Zero-padded so the intended order is unambiguous, and inserted back to front
		// so insertion order cannot be what makes the assertion pass.
		for (let i = PAGE_SIZE + 4; i > 0; i--) {
			await addSubmission(conference, `Talk ${String(i).padStart(3, '0')}`, i % 60);
		}

		const first = await listSubmissions(conference.id, {}, 1, 'title-asc');
		const second = await listSubmissions(conference.id, {}, 2, 'title-asc');
		const titles = [...first.rows, ...second.rows].map((r) => r.title);

		expect(new Set(titles).size).toBe(PAGE_SIZE + 4);
		expect(titles).toEqual([...titles].sort());
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

/**
 * "What is left to review" (#122 / #261) — the live pipeline, not "zero reviews".
 *
 * Two things here can only be asked of a database. The first is the status
 * boundary: an in-review talk with a handed-in review still belongs, a decided
 * talk does not, and a draft never did. The second is the one that would
 * embarrass us in front of an organizer: the number in the page header and the
 * number of rows the filter returns are two different queries, and they have
 * to agree. They are built from one expression now, and this is where that
 * stays true.
 */
describe('the still-to-review filter (#122)', () => {
	/** One in-review talk with a review, one assigned-but-unanswered, one untouched, one draft. */
	async function pile() {
		await addSubmission(conference, 'Reviewed talk', 1);
		await addSubmission(conference, 'Assigned talk', 2);
		await addSubmission(conference, 'Untouched talk', 3);
		await db.insert(submissionTable).values({
			conferenceId: conference.id,
			title: 'Draft talk',
			status: 'draft'
		});

		await addReview(await idFor('Reviewed talk'), REVIEWERS[0], { relevance: 4, depth: 8 });
		await addReview(await idFor('Assigned talk'), REVIEWERS[1], {
			relevance: null,
			depth: null,
			submitted: false
		});
		// The status a talk lands in once someone starts reviewing — and the one
		// that used to vanish from this filter as soon as a review was handed in.
		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					eq(submissionTable.title, 'Reviewed talk')
				)
			);
	}

	const titlesOf = async (filters = { needsReview: true }) =>
		(await listSubmissions(conference.id, filters, 1, 'title-asc')).rows.map((r) => r.title);

	it('keeps an in-review talk that already has a handed-in review', async () => {
		await pile();

		// The reviewed talk is the interesting one: it is in review and somebody
		// has handed a verdict in. That is still work outstanding until a decision
		// is made — dropping it hid the pile Fabian was actually looking at.
		expect(await titlesOf()).toEqual(['Assigned talk', 'Reviewed talk', 'Untouched talk']);
	});

	/**
	 * A draft is the speaker's work in progress. It has not been handed in, so it
	 * is not review work — and it would be on this list forever, since nobody can
	 * review it.
	 */

	it('leaves decided talks out even when nobody reviewed them', async () => {
		await pile();
		await addSubmission(conference, 'Already accepted', 5);
		await addSubmission(conference, 'Already withdrawn', 6);
		await db
			.update(submissionTable)
			.set({ status: 'accepted' })
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					eq(submissionTable.title, 'Already accepted')
				)
			);
		await db
			.update(submissionTable)
			.set({ status: 'withdrawn' })
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					eq(submissionTable.title, 'Already withdrawn')
				)
			);

		const titles = await titlesOf();
		expect(titles).toEqual(['Assigned talk', 'Reviewed talk', 'Untouched talk']);
		expect(titles).not.toContain('Already accepted');
		expect(titles).not.toContain('Already withdrawn');
	});

	it('leaves drafts out', async () => {
		await pile();

		expect(await titlesOf()).not.toContain('Draft talk');
		// And the status filter still reaches it, so this is a rule of the review
		// filter rather than a row the table has stopped being able to show.
		const drafts = await listSubmissions(conference.id, { status: ['draft'] });
		expect(drafts.rows.map((r) => r.title)).toEqual(['Draft talk']);
	});

	/**
	 * The header prints this count and links to this filter. They are separate
	 * queries; one expression feeds both, and this is the assertion that keeps it
	 * that way. Drift here reads as data loss to the person looking at the screen.
	 */
	it('matches the still-to-review count the page header shows', async () => {
		await pile();

		const totals = await submissionTotals(conference.id);
		const filtered = await listSubmissions(conference.id, { needsReview: true });

		expect(filtered.matching).toBe(totals.unreviewed);
		expect(totals.unreviewed).toBe(3);
	});

	it('composes with the other filters rather than replacing them', async () => {
		await pile();
		await addSubmission(conference, 'Untouched talk in review', 4);
		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					eq(submissionTable.title, 'Untouched talk in review')
				)
			);

		expect(await titlesOf({ needsReview: true, status: ['in_review'] } as never)).toEqual([
			'Reviewed talk',
			'Untouched talk in review'
		]);
	});

	/** The file is the view (ABS-13), and the new filter is part of the view. */
	it('carries into the export', async () => {
		await pile();

		const exported = await exportSubmissions(conference.id, { needsReview: true }, 'title-asc');
		expect(exported.rows.map((r) => r.title)).toEqual([
			'Assigned talk',
			'Reviewed talk',
			'Untouched talk'
		]);
	});
});

describe('ordering by how many reviews are in (#122)', () => {
	it('sorts by handed-in reviews across pages, fewest first and most first', async () => {
		// One more row than fits on a page, and the reviewed one sits at the very
		// bottom of the default order — so a sort applied to the page instead of the
		// query would leave it on page two and this test would see it nowhere.
		for (let i = 0; i < PAGE_SIZE + 1; i++) await addSubmission(conference, `Talk ${i}`, i);

		const busiest = await idFor(`Talk ${PAGE_SIZE}`);
		const middling = await idFor('Talk 0');
		await addReview(busiest, REVIEWERS[0], { relevance: 4, depth: 8 });
		await addReview(busiest, REVIEWERS[1], { relevance: 3, depth: 7 });
		await addReview(middling, REVIEWERS[2], { relevance: 2, depth: 6 });

		const most = await listSubmissions(conference.id, {}, 1, 'reviews-desc');
		expect(most.rows.slice(0, 2).map((r) => r.id)).toEqual([busiest, middling]);
		expect(most.rows[0].reviewsSubmitted).toBe(2);

		// Ascending: the 49 untouched talks fill the top, the one-review talk closes
		// page one, and the busiest is over on page two — where a sort applied to the
		// page instead of the query could never have put it.
		const fewest = await listSubmissions(conference.id, {}, 1, 'reviews-asc');
		expect(fewest.rows.map((r) => r.id)).not.toContain(busiest);
		expect(fewest.rows.slice(0, -1).every((r) => r.reviewsSubmitted === 0)).toBe(true);
		expect(fewest.rows.at(-1)?.id).toBe(middling);

		const lastPage = await listSubmissions(conference.id, {}, fewest.pageCount, 'reviews-asc');
		expect(lastPage.rows.at(-1)?.id).toBe(busiest);
	});

	/**
	 * An assignment is not a review. A talk three reviewers are sitting on has to
	 * stay at the fewest-first end, because it is precisely the one that still
	 * needs chasing.
	 */
	it('counts only what was handed in, not what was assigned', async () => {
		await addSubmission(conference, 'Waiting talk', 1);
		await addSubmission(conference, 'Done talk', 2);

		const waiting = await idFor('Waiting talk');
		for (const reviewer of REVIEWERS) {
			await addReview(waiting, reviewer, { relevance: null, depth: null, submitted: false });
		}
		await addReview(await idFor('Done talk'), REVIEWERS[0], { relevance: 4, depth: 8 });

		const fewest = await listSubmissions(conference.id, {}, 1, 'reviews-asc');
		expect(fewest.rows.map((r) => r.title)).toEqual(['Waiting talk', 'Done talk']);
		expect(fewest.rows[0].reviewsAssigned).toBe(3);
		expect(fewest.rows[0].reviewsSubmitted).toBe(0);
	});

	it('reads the two new orders and still refuses an unknown one', () => {
		expect(parseSort('reviews-asc')).toBe('reviews-asc');
		expect(parseSort('reviews-desc')).toBe('reviews-desc');
		expect(parseSort('reviews')).toBe('newest');
	});
});

/**
 * Who reviewed this, on the organizer's own page (#416).
 *
 * A blind round hides the reviewer from their peers. It never hid them from the
 * organizer — that page lists the same people by name and email in its assignment
 * block, so replacing the name in the reviews list above it hid nothing and cost
 * the organizer the link between a score and a person. The rule this pins: the
 * organizer sees the name, and `anonymized` says the round is blind.
 */
describe('reviewer identity on the organizer submission page (#416)', () => {
	let blindRoundId: number;
	let blindCriterionId: number;

	beforeAll(async () => {
		const [plan] = await db
			.insert(evaluationPlanTable)
			.values({ conferenceId: conference.id, name: 'Blind plan' })
			.returning();
		const [round] = await db
			.insert(reviewRoundTable)
			.values({
				evaluationPlanId: plan.id,
				name: 'Blind round',
				position: 0,
				anonymized: true
			})
			.returning();
		blindRoundId = round.id;

		const [criterion] = await db
			.insert(scorecardCriterionTable)
			.values({
				reviewRoundId: blindRoundId,
				label: 'Relevance',
				kind: 'rating',
				scaleMax: 5,
				weight: '1'
			})
			.returning();
		blindCriterionId = criterion.id;
	});

	async function addBlindReview(submissionId: number, reviewerUserId: string, relevance: number) {
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: blindRoundId,
				submissionId,
				reviewerUserId,
				status: 'submitted',
				submittedAt: new Date()
			})
			.returning();

		await db.insert(reviewScoreTable).values({
			reviewId: review.id,
			scorecardCriterionId: blindCriterionId,
			valueNumber: String(relevance)
		});
	}

	it('names the reviewers of a blind round and marks the round as blind', async () => {
		await addSubmission(conference, 'Blind talk', 1);
		const submissionId = await idFor('Blind talk');
		await addBlindReview(submissionId, REVIEWERS[0], 4);
		await addBlindReview(submissionId, REVIEWERS[1], 2);

		const detail = await submissionDetail(conference.id, submissionId);

		expect(detail?.reviews.map((r) => r.reviewerName).sort()).toEqual(
			[REVIEWERS[0], REVIEWERS[1]].sort()
		);
		// No row is called "Reviewer N" here — that label belongs to the peer surface.
		expect(detail?.reviews.some((r) => /^Reviewer \d+$/.test(r.reviewerName))).toBe(false);
		expect(detail?.reviews.every((r) => r.anonymized)).toBe(true);
	});

	/**
	 * Registration does not insist on a name, and a review by an account without
	 * one used to render a blank line — `?? 'Reviewer'` caught null, not `''`.
	 * The address is what the assignment block below identifies them by anyway.
	 */
	it('falls back to the address when the account has no name', async () => {
		const nameless = `nameless-${suffix}`;
		await db.insert(user).values({
			id: nameless,
			name: '',
			email: `${nameless}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		await addSubmission(conference, 'Nameless talk', 3);
		const submissionId = await idFor('Nameless talk');
		await addBlindReview(submissionId, nameless, 3);

		const detail = await submissionDetail(conference.id, submissionId);
		expect(detail?.reviews.map((r) => r.reviewerName)).toEqual([`${nameless}@example.com`]);

		await db.delete(user).where(eq(user.id, nameless));
	});

	it('leaves an open round exactly as it was: named, and not marked blind', async () => {
		await addSubmission(conference, 'Open talk', 2);
		const submissionId = await idFor('Open talk');
		await addReview(submissionId, REVIEWERS[2], { relevance: 5, depth: 9 });

		const detail = await submissionDetail(conference.id, submissionId);

		expect(detail?.reviews.map((r) => r.reviewerName)).toEqual([REVIEWERS[2]]);
		expect(detail?.reviews.every((r) => r.anonymized)).toBe(false);
	});
});
