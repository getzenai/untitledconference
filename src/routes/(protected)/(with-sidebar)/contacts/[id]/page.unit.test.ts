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
	availableEvents: [{ id: 2, name: 'Other Conf', slug: 'other', organizationId: 'org-1' }],
	duplicates: [] as Array<{
		id: number;
		name: string;
		email: string | null;
		company: string | null;
	}>
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
		// #421: say what happens for them, not that we declined to copy a row.
		expect(body).toContain('Adds them to this event');
		expect(body).toContain('Edits here show up on every event they are on');
		expect(body).not.toContain('no copy');
	});

	it('surfaces same-name duplicates with a merge action (CRM-06)', () => {
		const { body } = render(Page, {
			props: {
				data: {
					...baseData,
					duplicates: [
						{
							id: 99,
							name: 'Priya Raman',
							email: 'priya.raman.alt@sbek-test.example.com',
							company: 'Acme'
						}
					]
				} as never,
				form: null
			}
		});
		expect(body).toContain('data-testid="contact-duplicates"');
		expect(body).toContain('data-testid="contact-merge-submit"');
		expect(body).toContain('priya.raman.alt@sbek-test.example.com');
		expect(body).toContain('/contacts/99');
	});
});

/**
 * Tags takes a list, so the field has to be able to hold one (#831).
 *
 * `tagsFromFormInput` splits on `[\n,]+`, and an `<input>` cannot carry a
 * newline: pasting a two-line column into one turns `speaker\nsponsor` into
 * `speaker sponsor`, which the parser then reads as a single tag. Measured,
 * not assumed — a paste is an input event, and the browser drops the break.
 *
 * The assertion is on the rendered element rather than on the `rows` prop:
 * `rows` is what makes `BrowserDraftInput` a textarea, and the textarea is
 * what the person pastes into.
 */
describe('the tags field', () => {
	it('is a textarea, because the parser accepts a line-separated list', () => {
		const { body } = render(Page, { props: { data: baseData as never, form: null } });

		expect(body).toMatch(/<textarea[^>]*data-testid="contact-tags"/);
		expect(body).not.toMatch(/<input[^>]*data-testid="contact-tags"/);
	});

	it('says in the label what it accepts', () => {
		const { body } = render(Page, { props: { data: baseData as never, form: null } });

		expect(body).toContain('Tags (one per line, or comma-separated)');
		expect(body).not.toContain('Tags (comma-separated)');
	});
});
