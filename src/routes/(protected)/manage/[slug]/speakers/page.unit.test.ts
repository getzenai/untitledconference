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
	it('lists speakers with identity and status controls, plus add form', () => {
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
		expect(body).toContain('data-testid="speakers-add"');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('priya@example.com');
		expect(body).toContain('Staff Engineer');
		expect(body).toContain('Acme');
		expect(body).toContain('action="?/add"');
		expect(body).toContain('action="?/setStatus"');
		expect(body).toContain('data-testid="speaker-status-select"');
		expect(body).toContain('data-testid="speakers-search"');
		expect(body).toContain('data-testid="speakers-status-filter"');
		expect(body).toContain('data-testid="speaker-mail-compose"');
		expect(body).toContain('action="?/compose"');
		expect(body).toContain('Send to 1 speaker');
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
});
