/**
 * Contact detail: notes, tags, history, push-to-event (CRM-03 / CRM-04 / CRM-10).
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
	bio: 'Builds things.',
	notes: 'Internal note about Priya.',
	tags: ['vip'],
	events: [{ conferenceId: 1, slug: 'devflow', name: 'DevFlow', status: 'confirmed' as const }],
	sessions: [
		{
			submissionId: 9,
			title: 'Shipping faster',
			conferenceId: 1,
			conferenceSlug: 'devflow',
			conferenceName: 'DevFlow'
		}
	]
};

const baseData = {
	user: { id: 'organizer-1', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined },
	contact,
	availableEvents: [{ id: 2, name: 'Other Conf', slug: 'other', organizationId: 'org-1' }]
};

describe('contact detail page', () => {
	it('shows identity, notes, tags, history and push form', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="contact-detail-heading"');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('data-testid="contact-notes"');
		expect(body).toContain('Internal note about Priya.');
		expect(body).toContain('data-testid="contact-tags"');
		expect(body).toContain('data-testid="contact-history"');
		expect(body).toContain('DevFlow');
		expect(body).toContain('Shipping faster');
		expect(body).toContain('data-testid="contact-push"');
		expect(body).toContain('data-testid="contact-push-submit"');
	});
});
