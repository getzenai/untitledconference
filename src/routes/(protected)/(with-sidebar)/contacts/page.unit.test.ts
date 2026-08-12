/**
 * Contacts directory surface (CRM-01 / CRM-02): searchable table + filters.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const contact = {
	id: 5,
	organizationId: 'org-1',
	name: 'Priya Raman',
	sortName: 'Raman, Priya',
	email: 'priya@example.com',
	jobTitle: 'Staff Engineer',
	company: 'Acme',
	headshotUrl: null,
	bio: null,
	notes: null,
	tags: ['keynote'],
	events: [{ conferenceId: 1, slug: 'devflow', name: 'DevFlow', status: 'invited' as const }]
};

const baseData = {
	user: { id: 'organizer-1', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined },
	contacts: [contact],
	filters: {},
	filterOptions: {
		companies: ['Acme'],
		jobTitles: ['Staff Engineer'],
		tags: ['keynote']
	},
	organizationId: 'org-1',
	canManage: true
};

describe('contacts directory page', () => {
	it('renders a searchable table with company, job title, email and events', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="contacts-heading"');
		expect(body).toContain('data-testid="contacts-table"');
		expect(body).toContain('data-testid="contacts-filters"');
		expect(body).toContain('data-testid="contacts-search"');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('Acme');
		expect(body).toContain('Staff Engineer');
		expect(body).toContain('priya@example.com');
		expect(body).toContain('DevFlow');
		expect(body).toContain('/contacts/5');
	});

	it('shows Clear when filters are active', () => {
		const { body } = render(Page, {
			props: {
				data: {
					...baseData,
					filters: { company: 'Acme' }
				} as never,
				form: null
			}
		});
		expect(body).toContain('data-testid="contacts-clear-filters"');
	});

	it('prompts for an organization when the user cannot manage', () => {
		const { body } = render(Page, {
			props: {
				data: {
					...baseData,
					contacts: [],
					canManage: false,
					organizationId: null
				} as never,
				form: null
			}
		});
		expect(body).toContain('data-testid="contacts-empty-org"');
	});
});
