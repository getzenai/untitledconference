/** The table must expose two distinct actions: decide now, notify later. */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/manage/test-conf/submissions') }
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

function renderPage(notificationStatus: null | 'queued' = null) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submissions: [submission(1, 'accepted'), submission(2, 'submitted')],
				pagination: { matching: 2, page: 1, pageSize: 50, pageCount: 1 },
				facets: { tracks: [], formats: [] },
				filters: {},
				sort: 'newest',
				counts: { total: 2, undecided: 1, unreviewed: 2 },
				notificationStatuses: { 1: notificationStatus, 2: null }
			} as PageData,
			form: null
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

	it('shows whether each current decision has been notified', () => {
		const unsent = renderPage();
		expect(unsent).toContain('Notification');
		expect(unsent).toContain('Not sent');
		expect(unsent).toContain('Not ready');

		expect(renderPage('queued')).toContain('Queued');
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
