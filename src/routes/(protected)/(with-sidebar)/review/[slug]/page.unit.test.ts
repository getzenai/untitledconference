/**
 * The reviewer's queue, after #82 moved its two sorts onto the columns they order.
 *
 * The screen used to carry the sort twice — a row of tabs above the table saying
 * "fewest reviews first", and a Reviews column that did not look clickable — and the
 * reader had to join them up. One representation now, and these tests pin the parts
 * that are easy to get wrong when a control becomes a table header: the direction
 * each sort actually means, and that the link is still a link.
 */
import { roundWindow } from '$lib/conference/round-window';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

const row = (
	submissionId: number,
	title: string,
	reviewsSubmitted: number,
	rounds: string[] = ['Round 1'],
	window = roundWindow(null, null)
) => ({
	submissionId,
	title,
	track: 'Platform',
	// Ids the row can link with (#294) — one per name, in the order given.
	rounds: rounds.map((name, i) => ({ id: i + 1, name, submitted: false })),
	window,
	reviewsSubmitted,
	reviewsAssigned: 3,
	score: 4.2,
	ownReviewSubmitted: false,
	withdrawn: false
});

function renderQueue(
	queue: ReturnType<typeof row>[],
	sort: 'coverage' | 'score' | 'title' | 'track' = 'coverage',
	recused: string | null = null
) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Robin' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference: {
					id: 1,
					name: 'Test Conf',
					slug: 'test-conf',
					reviewVisibility: 'open'
				},
				queue,
				sort,
				recused,
				chatEnabled: false
			} as unknown as PageData
		}
	}).body;
}

function renderPage(sort: 'coverage' | 'score' | 'title' | 'track' = 'coverage') {
	return renderQueue([row(1, 'A talk', 0), row(2, 'Another talk', 2)], sort);
}

describe('the review queue sorts from its column headers', () => {
	it('says which direction each sort means, because they differ', () => {
		const coverage = renderPage('coverage');

		// `coverage` is fewest reviews first and `score` is highest first. A header
		// that reported both as the same direction would be telling a screen reader
		// the opposite of what the table shows on one of the two columns.
		expect(coverage).toContain('aria-sort="ascending"');
		expect(coverage).not.toContain('aria-sort="descending"');

		const score = renderPage('score');
		expect(score).toContain('aria-sort="descending"');
		expect(score).not.toContain('aria-sort="ascending"');
	});

	it('keeps each sort a link, so the view stays sendable', () => {
		const body = renderPage('coverage');

		expect(body).toContain('href="/review/test-conf?sort=coverage"');
		expect(body).toContain('href="/review/test-conf?sort=score"');
		expect(body).toContain('href="/review/test-conf?sort=title"');
		expect(body).toContain('href="/review/test-conf?sort=track"');
		// Exactly one header is marked current: two would mean the page cannot say
		// what it is showing.
		expect(body.match(/aria-current="true"/g) ?? []).toHaveLength(1);
	});

	it('exposes title and track as sort links with a single current header', () => {
		const title = renderPage('title');
		expect(title).toContain('data-testid="sort-by-title"');
		expect(title).toContain('aria-sort="ascending"');
		expect(title.match(/aria-current="true"/g) ?? []).toHaveLength(1);

		const track = renderPage('track');
		expect(track).toContain('data-testid="sort-by-track"');
		expect(track).toContain('aria-sort="ascending"');
		expect(track.match(/aria-current="true"/g) ?? []).toHaveLength(1);
	});

	it('has stopped saying the same thing in two places', () => {
		const body = renderPage('coverage');

		// The tab row is gone; its label survives once, as the sentence that explains
		// what the reader is looking at.
		expect(body.match(/Fewest reviews first/g) ?? []).toHaveLength(1);
		expect(body).toContain('The working list');
	});

	it('does not render a domain-less pathname as a permalink', () => {
		const body = renderPage('coverage');

		// The address bar already is the permalink. A path without the origin is not
		// a link anyone can send, so this copy has no job left.
		expect(body).not.toContain('Permalink for this view');
		expect(body).not.toMatch(/<code>[^<]*\?sort=/);
	});
});

describe('a submission held in more than one round', () => {
	it('names the rounds on the row, so one filed review does not look like done', () => {
		const body = renderQueue([row(1, 'Held twice', 0, ['Round 1', 'Blind round'])]);

		expect(body).toContain('Round 1');
		expect(body).toContain('Blind round');
	});

	// #294: with both rounds open the bare permalink can only reach the first, so
	// the names have to be links that name their round.
	it('links each round separately, not just the submission', () => {
		const body = renderQueue([row(1, 'Held twice', 0, ['Round 1', 'Blind round'])]);

		expect(body).toContain('href="/review/test-conf/1?round=1"');
		expect(body).toContain('href="/review/test-conf/1?round=2"');
	});

	it('stays quiet when there is only one round to name', () => {
		expect(renderQueue([row(1, 'Held once', 0)])).not.toContain('Round 1 ·');
	});
});

/**
 * A talk the speaker took back (RV-P1-01). It stood in the queue as "To do" with a
 * live review form — the reviewer was being asked to spend an hour on a talk that
 * had left.
 */
describe('a withdrawn talk', () => {
	const withdrawn = (over: Partial<ReturnType<typeof row>> = {}) => ({
		...row(3, 'A compiler in an afternoon', 0),
		withdrawn: true,
		...over
	});

	it('is labelled withdrawn rather than asked for', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).toContain('Withdrawn');
		// The exact regression: it must not still read as work owed.
		expect(body).not.toContain('To do');
	});

	it('is out of the count, so a finished queue reads finished', () => {
		// One real talk, reviewed; one withdrawn. The reviewer owes nothing.
		const body = renderQueue([
			{ ...row(1, 'Reviewed talk', 2), ownReviewSubmitted: true },
			withdrawn()
		]);

		expect(body).toContain('1 of 1 reviewed');
		expect(body).not.toContain('1 of 2 reviewed');
	});

	it('still lists the talk, because vanishing looks like never-assigned', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).toContain('A compiler in an afternoon');
	});

	it('does not borrow the "Reviewed" badge from a review this person never filed', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).not.toContain('Reviewed<');
	});
});

/**
 * ABS-01 in the queue: a round that is shut asks nothing, and "To do" would be an
 * instruction the reviewer cannot follow.
 */
describe('the window of the rounds a row sits in', () => {
	const day = 86_400_000;
	const now = new Date('2027-03-10T12:00:00Z');

	it('replaces To do with the window while the review is outstanding', () => {
		const closed = renderQueue([
			row(1, 'A talk', 0, ['Round 1'], roundWindow(null, new Date(now.getTime() - day), now))
		]);

		expect(closed).toContain('Closed');
		expect(closed).not.toContain('To do');

		const soon = renderQueue([
			row(
				2,
				'Another talk',
				0,
				['Round 1'],
				roundWindow(new Date(now.getTime() + 2 * day), null, now)
			)
		]);

		expect(soon).toContain('Opens in 2 days');
		expect(soon).not.toContain('To do');
	});

	it('keeps a filed review reading as Reviewed after the round closes', () => {
		const body = renderQueue([
			{
				...row(1, 'A talk', 1, ['Round 1'], roundWindow(null, new Date(now.getTime() - day), now)),
				ownReviewSubmitted: true
			}
		]);

		expect(body).toContain('Reviewed');
		expect(body).not.toContain('Closed');
	});

	it('says To do while the round is running', () => {
		expect(renderQueue([row(1, 'A talk', 0)])).toContain('To do');
	});
});

describe('the in-app chat', () => {
	it('is absent while the flag is off', () => {
		expect(renderPage()).not.toContain('data-testid="reviewer-chat"');
	});

	it('renders on the queue when the flag is on', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'reviewer-1', name: 'Robin' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: {
						id: 1,
						name: 'Test Conf',
						slug: 'test-conf',
						reviewVisibility: 'open'
					},
					queue: [row(1, 'A talk', 0)],
					sort: 'coverage',
					chatEnabled: true
				} as unknown as PageData
			}
		}).body;

		expect(body).toContain('data-testid="reviewer-chat"');
		expect(body).toContain('Review assistant');
	});
});

describe('after a recusal (#463)', () => {
	it('names the talk that was handed back and who has it now', () => {
		const body = renderQueue([row(1, 'A talk', 0)], 'coverage', 'The one I know too well');

		expect(body).toContain('data-testid="recused-notice"');
		expect(body).toContain('The one I know too well');
		expect(body).toContain('The organizers have it back');
	});

	it('still says a recusal happened when the title did not survive the redirect', () => {
		const body = renderQueue([row(1, 'A talk', 0)], 'coverage', '');

		expect(body).toContain('data-testid="recused-notice"');
		expect(body).toContain('no longer assigned to that talk');
	});

	it('says nothing to a reviewer who simply opened their queue', () => {
		expect(renderQueue([row(1, 'A talk', 0)])).not.toContain('data-testid="recused-notice"');
	});
});

/**
 * #464: "22 of 28 reviewed" answers how far the season has got, not what is mine
 * to do tonight. The row badges tell the truth per talk now; this is the same
 * truth counted once, at the top, where a volunteer with a free evening looks.
 */
describe('what can actually be filed today', () => {
	const soon = roundWindow(new Date(Date.now() + 4 * 86_400_000), null);

	/**
	 * The counts line only — the "Mine" column header carries the same words in its
	 * hint (#465), and a whole-page `toContain` would pass on that instead.
	 */
	const counts = (html: string) => {
		const at = html.indexOf('data-testid="queue-counts"');
		return at === -1 ? '' : html.slice(at, html.indexOf('</p>', at));
	};

	it('counts only the rows whose round is open', () => {
		const waiting = { ...row(1, 'Open now', 0) };
		const later = { ...row(2, 'Opens later', 0), window: soon };

		expect(counts(renderQueue([waiting, later]))).toContain('1 you can file now');
	});

	it('says so plainly when the queue is full but nothing can be filed', () => {
		const later = { ...row(1, 'Opens later', 0), window: soon };
		const line = counts(renderQueue([later]));

		expect(line).toContain('nothing you can file today');
		expect(line).not.toContain('you can file now');
	});

	it('claims nothing when every assignment is answered', () => {
		const done = { ...row(1, 'Filed', 0), ownReviewSubmitted: true };
		const line = counts(renderQueue([done]));

		expect(line).not.toContain('you can file now');
		expect(line).not.toContain('nothing you can file today');
	});
});
