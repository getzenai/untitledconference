/**
 * What the builder says about the form it is building.
 *
 * Fabian read the builder as "I have to configure the obvious things myself",
 * and he was reading it correctly: with no fields configured the page said "A
 * form with no fields collects nothing but a title", and the preview headed
 * "What the submitter sees" said "Nothing to fill in yet". Neither was true —
 * title, abstract, format, track and the whole speaker block are hard-coded in
 * `proposal-form.svelte` and are always asked.
 *
 * So the assertions here are about honesty, and the sharpest one is the
 * *absence* of the old sentences: a fixed list added while the contradicting
 * copy stays would leave the screen saying both things at once.
 */
import { FIXED_QUESTION_GROUPS } from '$lib/conference/fixed-questions';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

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

const cfpForm = {
	id: 7,
	conferenceId: 1,
	title: 'Test Conf — Call for papers',
	description: null,
	status: 'draft' as const,
	opensAt: null,
	closesAt: null,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const field = {
	id: 3,
	cfpFormId: 7,
	label: 'Workshop capacity',
	kind: 'short_text' as const,
	required: false,
	position: 0,
	options: null,
	conditionSource: null,
	conditionFieldId: null,
	conditionValue: null,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const body = (fields: (typeof field)[]) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				form: cfpForm,
				fields,
				tracks: [{ id: 1, name: 'Platform' }],
				formats: [{ id: 1, name: 'Talk' }]
			},
			form: null
		}
	}).body;

const labels = FIXED_QUESTION_GROUPS.flatMap((group) => group.questions).map((q) => q.label);

describe('the call-for-papers builder', () => {
	it('lists every always-asked question, with nothing configured', () => {
		const html = body([]);

		expect(html).toContain('data-testid="cfp-fixed-questions"');
		for (const label of labels) expect(html).toContain(label);
	});

	// The two sentences this whole change exists to delete. Asserted by absence
	// rather than by the new copy: adding an honest list while leaving the old
	// claim in place would make the page contradict itself, and every positive
	// assertion above would still pass.
	it('no longer tells an organizer that an empty field list is an empty form', () => {
		const html = body([]);

		expect(html).not.toContain('collects nothing but a title');
		expect(html).not.toContain('Nothing to fill in yet');
	});

	it('keeps the always-asked list when extra fields exist, and shows both', () => {
		const html = body([field]);

		expect(html).toContain('Workshop capacity');
		for (const label of labels) expect(html).toContain(label);
	});

	// The preview is the half an organizer believes. If the fixed questions were
	// only listed in the editor column, "What the submitter sees" would still be
	// showing a form that asks nothing.
	it('shows the always-asked questions in the preview as well', () => {
		const html = body([]);
		const preview = html.slice(html.indexOf('What the submitter sees'));

		for (const label of labels) expect(preview).toContain(label);
	});
});
