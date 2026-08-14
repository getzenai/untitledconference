/**
 * Contacts directory surface (CRM-01 / CRM-02 / CRM-12): table, filters, overview.
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
	canManage: true,
	overview: {
		totalContacts: 3,
		eventsWithSpeakers: 2,
		returningSpeakers: 1,
		topCompanies: [
			{ company: 'Acme', count: 2 },
			{ company: 'Globex', count: 1 }
		]
	},
	segments: [] as Array<{
		id: number;
		organizationId: string;
		name: string;
		filters: { q?: string; company?: string; jobTitle?: string; tag?: string };
		createdAt: Date;
	}>,
	duplicateIds: [] as number[]
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

	it('renders CRM overview KPIs and a populated top-companies widget (CRM-12)', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="crm-overview"');
		expect(body).toContain('data-testid="crm-kpi-total-contacts"');
		expect(body).toContain('data-testid="crm-kpi-events"');
		expect(body).toContain('data-testid="crm-kpi-returning"');
		expect(body).toContain('data-testid="crm-top-companies"');
		expect(body).toContain('data-testid="crm-top-companies-list"');
		// KPI values
		expect(body).toMatch(/crm-kpi-total-contacts"[^>]*>\s*3/);
		expect(body).toMatch(/crm-kpi-events"[^>]*>\s*2/);
		expect(body).toMatch(/crm-kpi-returning"[^>]*>\s*1/);
		// Widget drill-through uses the existing company filter
		expect(body).toContain('/contacts?company=Acme');
		expect(body).toContain('Globex');
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

	it('renders saved segments and a save form when filters are active (CRM-09)', () => {
		const { body } = render(Page, {
			props: {
				data: {
					...baseData,
					filters: { tag: 'AI' },
					segments: [
						{
							id: 1,
							organizationId: 'org-1',
							name: 'AI Experts',
							filters: { tag: 'AI' },
							createdAt: new Date('2027-01-01')
						}
					]
				} as never,
				form: null
			}
		});
		expect(body).toContain('data-testid="contacts-segments"');
		expect(body).toContain('data-testid="contacts-save-segment"');
		expect(body).toContain('data-testid="contacts-segments-list"');
		expect(body).toContain('AI Experts');
		expect(body).toContain('/contacts?tag=AI');
	});

	it('offers add and import as header buttons, not as cards below the table (#419)', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="contacts-add-open"');
		expect(body).toContain('data-testid="contacts-import-open"');
		// The dialogs render their content on open, so nothing of the two forms
		// sits in the page below the directory table.
		expect(body).not.toContain('data-testid="contacts-add-name"');
		expect(body).not.toContain('data-testid="speakers-import"');
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
