/**
 * Pagination is the one feature whose bugs are invisible on the screen that has it:
 * every page looks plausible on its own. What has to be checked against a real
 * database is that the pages together are the whole pile, exactly once — and that the
 * count the header shows is the filter's count, not the page's.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listSubmissions, PAGE_SIZE } from './organizer-submissions';

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
