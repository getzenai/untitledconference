/** The table must expose two distinct actions: decide now, notify later. */
import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

// Mutable, because the sort links are built from the URL that is on screen: a fixed
// mock could not tell "the sort carries the filters" from "the sort drops them".
const currentUrl = vi.hoisted(() => ({
	value: new URL('https://example.test/manage/test-conf/submissions')
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return currentUrl.value;
		}
	}
}));

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	statusBeforeArchive: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const submission = (id: number, status: 'accepted' | 'submitted') => ({
	id,
	title: status === 'accepted' ? 'A decided talk' : 'An undecided talk',
	status,
	contentApproval: 'pending' as const,
	submittedAt: new Date('2027-01-02T00:00:00Z'),
	track: null,
	sessionFormat: null,
	sponsorTier: null,
	speakers: [
		{
			id: id + 10,
			name: 'Ada Speaker',
			jobTitle: null,
			company: null,
			headshotUrl: null,
			isPrimary: true,
			roleLabel: null
		}
	],
	score: null,
	reviewsSubmitted: 0,
	reviewsAssigned: 0
});

const assignmentTargets = [
	{
		id: 10,
		name: 'Screening',
		reviewers: [
			{ userId: 'rev-1', name: 'Riley Reviewer', email: 'riley@example.com' },
			{ userId: 'rev-2', name: 'Sam Score', email: 'sam@example.com' }
		]
	}
];

function renderPage(
	notificationStatus: null | 'queued' | 'sent' | 'failed' = null,
	sort: PageData['sort'] = 'newest',
	query = '',
	filters: PageData['filters'] = {},
	notificationResult: NotificationResult | null = null,
	targets = assignmentTargets
) {
	currentUrl.value = new URL(`https://example.test/manage/test-conf/submissions${query}`);
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submissions: [submission(1, 'accepted'), submission(2, 'submitted')],
				pagination: { matching: 2, page: 1, pageSize: 50, pageCount: 1 },
				facets: { tracks: [], formats: [] },
				filters,
				sort,
				counts: { total: 2, undecided: 1, unreviewed: 2 },
				notificationStatuses: { 1: notificationStatus, 2: null },
				assignmentTargets: targets
			} as PageData,
			form: notificationResult ? { notificationResult } : null
		}
	}).body;
}

describe('organizer submission decisions', () => {
	it('keeps status changes and speaker notification as separate actions', () => {
		const body = renderPage();

		expect(body).toContain('action="?/decide"');
		expect(body).toContain('formaction="?/notify"');
		expect(body).toContain('Notify decisions');
		expect(body).toContain('Decisions do not notify speakers;');
		expect(body).toMatch(/notifications\s+are sent separately after the programme is checked\./);
		expect(body).not.toContain('automatically notif');
	});

	it('asks in the page before a bulk decision so a missed click cannot decide the pile', () => {
		const body = renderPage();

		// In-page dialog, not window.confirm — Playwright dismisses a native
		// dialog and CFP-12 would fail on the bulk path. The dialog itself is
		// closed on first paint, so only the hook is in the SSR markup.
		expect(body).toContain('data-testid="bulk-decide"');
		expect(body).toContain('data-confirm-decision');
		expect(body).toContain('data-confirm="dialog"');
		expect(body).toContain('value="accepted"');
		expect(body).toContain('value="rejected"');
		expect(body).toContain('value="waitlisted"');
	});

	/**
	 * ABS-06: selection already exists for decide/notify; bulk assign rides the
	 * same checkboxes with a third action. Without a round there is nothing to
	 * assign to, so the controls stay off the page rather than offering a dead form.
	 */
	it('offers bulk reviewer assignment next to the decision buttons', () => {
		const body = renderPage();

		expect(body).toContain('data-testid="bulk-assign"');
		expect(body).toContain('formaction="?/assign"');
		expect(body).toContain('Assign reviewers');
		expect(body).toContain('formaction="?/distribute"');
		expect(body).toContain('Auto-distribute');
		expect(body).toContain('data-testid="bulk-assign-round"');
		expect(body).toContain('data-testid="bulk-assign-per-talk"');
		expect(body).toContain('data-testid="bulk-assign-cap"');
		expect(body).toContain('name="roundId"');
		// Reviewer checkboxes mount after a round is chosen — the E2E owns that.
	});

	it('hides bulk assign when the conference has no review rounds yet', () => {
		const body = renderPage(null, 'newest', '', {}, null, []);

		expect(body).not.toContain('data-testid="bulk-assign"');
		expect(body).not.toContain('formaction="?/assign"');
	});

	/**
	 * Named doors off the table: scorecard, pool, export. The rail has them too;
	 * this strip is for an agent already on Submissions hunting by word.
	 */
	it('names scorecards, the reviewer pool and the scores export from the header', () => {
		const body = renderPage();

		expect(body).toContain('data-testid="submissions-abs-links"');
		expect(body).toContain('Scorecards &amp; weights');
		expect(body).toContain('href="/manage/test-conf/rounds"');
		expect(body).toContain('Reviewer pool');
		expect(body).toContain('href="/manage/test-conf/people"');
		expect(body).toContain('Export scores (CSV)');
		expect(body).toContain('data-testid="export-csv"');
	});

	it('shows whether each current decision has been notified', () => {
		const unsent = renderPage();
		expect(unsent).toContain('Notification');
		expect(unsent).toContain('Not sent');
		expect(unsent).toContain('Not ready');

		expect(renderPage('queued')).toContain('Queued');
	});

	it('does not style a failed bulk dispatch as success', () => {
		const body = renderPage(
			null,
			'newest',
			'',
			{},
			{
				notified: 1,
				alreadyNotified: 0,
				notDecided: 0,
				withoutEmail: 0,
				emailsQueued: 1,
				dispatch: { sent: 0, failed: 1, remaining: 0, disabled: false }
			}
		);

		expect(body).toContain('border-status-bad');
		expect(body).toContain('role="alert"');
		expect(body).not.toContain('1 submission notified');
	});
});

/**
 * The filter row. Two things it used to get wrong: several statuses at once were
 * asked for with ⌘-click on a `multiple` listbox — invisible, and a plain click
 * silently threw the other picks away — and every change then needed a second
 * press on a "Filter" button to mean anything.
 */
describe('submission filters', () => {
	it('asks for several statuses with checkboxes rather than a ⌘-click listbox', () => {
		const body = renderPage();

		expect(body).toContain('data-testid="submission-filters"');
		// Same repeated `status` parameter the server has read as a list all along;
		// only the control changed.
		expect(body).toContain('type="checkbox"');
		expect(body).toContain('name="status"');
		expect(body).not.toContain('multiple');
		expect(body).not.toContain('⌘');
	});

	it('applies on change instead of behind a Filter button', () => {
		const body = renderPage();

		// Without JavaScript nothing would apply at all, so one Filter button survives
		// — inside `<noscript>`, and nowhere else. Counting is the assertion: a bare
		// "no Filter button anywhere" would fail on the fallback, and "a noscript
		// exists" would pass with the old button still sitting next to it.
		expect(body.match(/>\s*Filter\s*</g) ?? []).toHaveLength(1);
		expect(body).toMatch(/<noscript><button[^>]*>\s*Filter\s*<\/button><\/noscript>/);
	});

	/** One control in the shell now; two copies of it were one too many. */
	it('leaves the public-site link to the shell', () => {
		expect(renderPage()).not.toContain('View the public site');
	});
});

/**
 * Sortable columns (#82). Two columns now, and the interesting part is not that they
 * sort — the loader does that — but the state machine on the header: three clicks
 * return to the order the screen opened in, and the URL keeps everything else.
 */
describe('sortable columns', () => {
	it('offers the alphabet on Title and the ranking on Score, each opening its own way', () => {
		const body = renderPage();

		// The direction of the first click differs per column on purpose: nobody
		// starts at the lowest score, and nobody starts at Z.
		expect(body).toContain('href="/manage/test-conf/submissions?sort=title-asc"');
		expect(body).toContain('href="/manage/test-conf/submissions?sort=score-desc"');
		// Neither is active yet, and a screen reader is told so rather than left to
		// infer it from an arrow it cannot see.
		// Three sortable columns since #122 added Reviews.
		expect(body.match(/aria-sort="none"/g) ?? []).toHaveLength(3);
		expect(body).not.toContain('aria-sort="ascending"');
	});

	it('cycles the third click back to the newest-first order', () => {
		const ascending = renderPage(null, 'title-asc', '?sort=title-asc');
		expect(ascending).toContain('aria-sort="ascending"');
		expect(ascending).toContain('href="/manage/test-conf/submissions?sort=title-desc"');

		const descending = renderPage(null, 'title-desc', '?sort=title-desc');
		expect(descending).toContain('aria-sort="descending"');
		// The way out: no `sort` in the URL at all, not `sort=newest`. Anything else
		// leaves the organizer with a two-state toggle and no way back.
		expect(descending).toContain('href="/manage/test-conf/submissions"');
	});

	/**
	 * The regression this really guards: a sort link built from anything other than
	 * the URL on screen throws the filters away, and the organizer discovers it by
	 * losing a filtered pile they had spent ten minutes narrowing.
	 */
	it('carries the filters into the sort and leaves the page number behind', () => {
		const body = renderPage(null, 'newest', '?q=graph&status=submitted&page=3');

		expect(body).toContain(
			'href="/manage/test-conf/submissions?q=graph&amp;status=submitted&amp;sort=title-asc"'
		);
		expect(body).not.toContain('sort=title-asc&amp;page=3');
	});

	it('drops the header that never stuck', () => {
		// `sticky top-0` sat on this thead and could not work: the box around the table
		// is the scroll container, and it does not scroll vertically. A dead rule that
		// reads as a feature is worse than no feature.
		expect(renderPage()).not.toContain('sticky top-0');
	});
});

/**
 * What is left to review (#122).
 *
 * Fabian's report and the user interview behind it name the same two things: a
 * filter for the pile that still needs reviewing, and an order by how many reviews
 * are in. The loader does the work; what this page owes is a way to ask for it that
 * survives being sent to a colleague — so both live in the URL, like every other
 * control on this screen.
 */
describe('the still-to-review filter and the reviews column', () => {
	it('opens the reviews column at fewest first, which is where the work is', () => {
		const body = renderPage();

		expect(body).toContain('href="/manage/test-conf/submissions?sort=reviews-asc"');
		expect(body).toContain('data-testid="sort-by-reviews"');
	});

	it('cycles reviews through most-first and back out to the default', () => {
		const fewest = renderPage(null, 'reviews-asc', '?sort=reviews-asc');
		expect(fewest).toContain('href="/manage/test-conf/submissions?sort=reviews-desc"');

		const most = renderPage(null, 'reviews-desc', '?sort=reviews-desc');
		expect(most).toContain('href="/manage/test-conf/submissions"');
	});

	/**
	 * The count in the header IS the way into the filter. Reading "2 still to review"
	 * and then having to build the query by hand is the gap the issue describes.
	 */
	it('makes the still-to-review count a link to the filter it counts', () => {
		const body = renderPage();

		expect(body).toContain('href="/manage/test-conf/submissions?needsReview=on"');
		expect(body).toContain('data-testid="unreviewed-count"');
		expect(body).toContain('2 still to review');
		// Same set as the filter. A second "awaiting a decision" would just ask
		// the reader why the same 2 is printed twice.
		expect(body).not.toContain('awaiting a decision');
	});

	it('offers the filter as a checkbox and shows it as on when it is', () => {
		expect(renderPage()).toContain('data-testid="filter-needs-review"');
		expect(renderPage()).not.toContain('name="needsReview" checked');

		// Checked, and the page counts itself as filtered — otherwise "Clear" is
		// missing and the empty state says "no submissions yet" instead of "nothing
		// matches".
		const on = renderPage(null, 'newest', '?needsReview=on', { needsReview: true });
		expect(on).toContain('name="needsReview" checked');
		expect(on).toContain('match the filter');
	});

	/**
	 * Handed in over assigned, and both halves are needed: 0/3 is three reviewers
	 * sitting on a talk, 0/0 is a talk nobody has been asked about. One number
	 * cannot tell those apart, and they call for different actions.
	 */
	it('shows reviews handed in over reviews assigned', () => {
		expect(renderPage()).toContain('data-testid="reviews-cell"');
	});
});
