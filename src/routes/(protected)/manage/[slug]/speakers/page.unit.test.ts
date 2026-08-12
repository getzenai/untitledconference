/**
 * Roster surface: list, search, add, status controls (SPK-01/02/04).
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/manage/devflow-conf-2027/speakers') }
}));

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'DevFlow Conf',
	slug: 'devflow-conf-2027',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const speaker = {
	conferenceSpeakerId: 10,
	speakerProfileId: 5,
	status: 'invited' as const,
	logistics: null,
	name: 'Priya Raman',
	sortName: 'Raman, Priya',
	email: 'priya@example.com',
	jobTitle: 'Staff Engineer',
	company: 'Acme',
	headshotUrl: null,
	bio: 'Builds things.',
	notes: null,
	hasAccount: false
};

describe('speaker roster page', () => {
	it('lists speakers at rest — roster and filters visible, writes behind dialogs', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [speaker],
					filters: {},
					counts: {
						total: 1,
						invited: 1,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="speakers-table"');
		expect(body).toContain('data-testid="speakers-filters"');
		// The write entry points are present as triggers…
		expect(body).toContain('data-testid="speakers-add"');
		expect(body).toContain('data-testid="speaker-mail-open"');
		expect(body).toContain('data-testid="speakers-import-open"');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('priya@example.com');
		expect(body).toContain('Staff Engineer');
		expect(body).toContain('Acme');
		expect(body).toContain('action="?/setStatus"');
		expect(body).toContain('data-testid="speaker-status-select"');
		expect(body).toContain('data-testid="speakers-search"');
		expect(body).toContain('data-testid="speakers-status-filter"');
		// …but at rest the write forms themselves are behind dialogs, not in the DOM.
		expect(body).not.toContain('action="?/add"');
		expect(body).not.toContain('action="?/compose"');
		expect(body).not.toContain('action="?/import"');
		expect(body).not.toContain('data-testid="add-name"');
		expect(body).not.toContain('data-testid="speaker-mail-body"');
		expect(body).not.toContain('data-testid="import-csv"');
		expect(body).not.toContain('Send to 1 speaker');
		// #64: tall rosters scroll inside a capped box with a sticky header.
		expect(body).toContain('data-testid="speakers-table-head"');
		// Class list is emitted before data-testid in SSR attribute order.
		expect(body).toMatch(/sticky top-0[^>]*data-testid="speakers-table-head"/);
		expect(body).toContain('max-h-[min(70vh,40rem)]');
	});

	it('shows empty state when the roster has no rows', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="speakers-empty"');
		expect(body).toContain('No speakers on this conference yet');
		expect(body).not.toContain('data-testid="speakers-table"');
	});

	it('renders a rejected write as a red alert, not a green success', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: { error: 'A name is required.' }
			}
		});

		expect(body).toContain('data-testid="speakers-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('A name is required.');
		expect(body).not.toContain('data-testid="speakers-message"');
		expect(body).not.toContain('text-status-good');
	});

	it('never shows a dialog-scoped answer on the page banner — it lives beside the click', () => {
		// Import answers inside its own dialog.
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: { scope: 'import', message: 'Imported 12 speakers.' }
			}
		});

		expect(body).not.toContain('data-testid="speakers-message"');
		expect(body).not.toContain('data-testid="speakers-error"');
		expect(body).not.toContain('Imported 12 speakers.');

		// Compose and add scoped failures must not surface here either: the dialog
		// stays open on failure, so a page banner would sit behind the overlay —
		// the double-confirmation this class of bug is about (#220 review round 2).
		for (const scope of ['add', 'compose'] as const) {
			const failed = render(Page, {
				props: {
					data: {
						user: { id: 'organizer-1', name: 'Jordan' },
						impersonating: null,
						analytics: { apiKey: undefined, host: undefined },
						conference,
						speakers: [],
						filters: {},
						counts: {
							total: 0,
							invited: 0,
							confirmed: 0,
							declined: 0,
							cancelled: 0
						},
						statuses: ['invited', 'confirmed', 'declined', 'cancelled']
					} as never,
					form: { scope, error: `A ${scope} error.` }
				}
			});

			expect(failed.body).not.toContain('data-testid="speakers-message"');
			expect(failed.body).not.toContain('data-testid="speakers-error"');
			expect(failed.body).not.toContain('A add error.');
			expect(failed.body).not.toContain('A compose error.');
		}
	});
});
