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

/**
 * The form data the builder posts (#124).
 *
 * Every native `<select>` and `<input type="datetime-local">` on this screen
 * became a shadcn control, and the actions on the far side read their form data
 * by hand — `text(form, 'conditionValueFormat')`, `when(form, 'closesAt')`. A
 * change of appearance that dropped or renamed one of those keys would not fail
 * a single test above; it would just quietly stop saving that setting. So this
 * block pins the names, and only the names.
 */
const conditionalField = {
	...field,
	id: 4,
	label: 'Workshop capacity',
	conditionSource: 'session_format' as const,
	conditionValue: '1'
};

const dated = {
	...cfpForm,
	opensAt: new Date('2027-01-05T09:00:00Z'),
	closesAt: new Date('2027-02-15T22:59:00Z')
};

const bodyWith = (
	form: typeof cfpForm | typeof dated,
	fields: (typeof field | typeof conditionalField)[]
) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				form,
				fields,
				tracks: [{ id: 1, name: 'Platform' }],
				formats: [{ id: 1, name: 'Talk' }]
			},
			form: null
		}
	}).body;

describe('what the builder posts', () => {
	it('names every control the update actions read', () => {
		const html = bodyWith(dated, [field]);

		// Settings — read by `updateForm`.
		for (const name of ['title', 'status', 'opensAt', 'closesAt', 'description']) {
			expect(html).toContain(`name="${name}"`);
		}

		// A field — read by `fieldInput()`, for both the edit and the add form.
		for (const name of ['label', 'kind', 'required', 'conditionSource']) {
			expect(html).toContain(`name="${name}"`);
		}
	});

	it('names the condition control that belongs to the stored source, and only that one', () => {
		// `conditionValue()` on the server reads whichever input the source names.
		// The other two are not merely hidden now — they are not rendered — so a
		// rule saved as "only for format Talk" must still find its own control.
		const html = bodyWith(cfpForm, [conditionalField]);

		expect(html).toContain('name="conditionValueFormat"');
		expect(html).not.toContain('name="conditionValueTrack"');
	});

	it('carries the stored deadlines as local wall time, the way the submit handler expects', () => {
		// `saveSettings` runs `new Date(raw).toISOString()` over these two values.
		// A zone suffix here would be converted twice and walk the deadline.
		const html = bodyWith(dated, []);

		expect(html).toMatch(/name="opensAt" value="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
		expect(html).toMatch(/name="closesAt" value="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
	});

	it('has no browser-drawn control left on it', () => {
		// Fabian's reading of the screen, as an assertion: the date field was the
		// last thing on it the browser styled for itself.
		const html = bodyWith(dated, [conditionalField]);

		expect(html).not.toContain('<select');
		expect(html).not.toContain('datetime-local');
	});
});
