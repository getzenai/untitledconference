/**
 * What the submitter's form actually asks, once the organizer has removed
 * questions from it (#159).
 *
 * `fixed-questions.unit.test.ts` proves the model reads the stored column the
 * right way round, and the integration tests prove the server ignores what it
 * does not ask. Neither can see the thing in between: whether the component
 * renders the control at all. That matters more than it sounds — a control left
 * in the markup and hidden with CSS still posts, and the server would then be
 * dropping a value the submitter watched themselves type.
 */
import { fixedQuestionVisibility } from '$lib/conference/fixed-questions';
import { emptyProposal } from '$lib/conference/proposal-draft';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ProposalForm from './proposal-form.svelte';

const body = (hidden: string | null) =>
	render(ProposalForm, {
		props: {
			fields: [],
			fixed: fixedQuestionVisibility(hidden),
			formats: [{ id: 1, name: 'Talk', minutes: 30 }],
			tracks: [{ id: 2, name: 'Platform' }],
			initial: emptyProposal(),
			signedIn: true
		}
	}).body;

/** The control, not the word: "Track" also appears in prose elsewhere on the page. */
const posts = (html: string, name: string) => html.includes(`name="${name}"`);

describe('the proposal form', () => {
	it('asks everything when the call has removed nothing', () => {
		const html = body(null);

		for (const name of [
			'title',
			'abstract',
			'keyTakeaway',
			'sessionFormatId',
			'trackId',
			'audienceLevel',
			'speakerName',
			'speakerSortName',
			'speakerEmail',
			'speakerJobTitle',
			'speakerCompany',
			'speakerBio'
		]) {
			expect(posts(html, name), name).toBe(true);
		}
	});

	it('does not render a control for a question the call removed', () => {
		const html = body('["abstract","keyTakeaway","trackId","speakerBio"]');

		expect(posts(html, 'abstract')).toBe(false);
		expect(posts(html, 'keyTakeaway')).toBe(false);
		expect(posts(html, 'trackId')).toBe(false);
		expect(posts(html, 'speakerBio')).toBe(false);

		// And leaves the rest of the form alone.
		expect(posts(html, 'title')).toBe(true);
		expect(posts(html, 'sessionFormatId')).toBe(true);
		expect(posts(html, 'speakerCompany')).toBe(true);
	});

	it('lets a signed-out visitor submit the form they just filled (#236)', () => {
		const html = render(ProposalForm, {
			props: {
				fields: [],
				fixed: fixedQuestionVisibility(null),
				formats: [],
				tracks: [],
				initial: emptyProposal(),
				signedIn: false
			}
		}).body;

		expect(html).toContain('Sign in to submit');
		expect(html).toContain('data-testid="cfp-sign-in-to-submit"');
		expect(html).toContain("We'll send this proposal as soon as you sign in.");
		// Without this the JS-less POST has no action name, SvelteKit looks for
		// `default`, and the visitor gets a 404 instead of /login.
		expect(html).toContain('formaction="?/submit"');
	});

	it('keeps the three that identify the talk and the speaker, whatever is stored', () => {
		// Every removable key at once — the emptiest form the product allows.
		const html = body(
			JSON.stringify([
				'abstract',
				'keyTakeaway',
				'sessionFormatId',
				'trackId',
				'audienceLevel',
				'speakerSortName',
				'speakerJobTitle',
				'speakerCompany',
				'speakerBio',
				'coSpeakers'
			])
		);

		expect(posts(html, 'title')).toBe(true);
		expect(posts(html, 'speakerName')).toBe(true);
		expect(posts(html, 'speakerEmail')).toBe(true);
	});

	// The heading is the part a submitter reads; a "Co-presenters" heading over
	// nothing is the same broken-looking form as an empty grid column.
	it('drops the co-presenter section with its heading', () => {
		expect(body(null)).toContain('Co-presenters');
		expect(body('["coSpeakers"]')).not.toContain('Co-presenters');
	});

	it('collapses a two-up row to one column when its partner is gone', () => {
		expect(body(null)).toContain('sm:grid-cols-2');
		// Sort-as and job title are the partners of name and email; without them
		// those rows would render as a control beside an empty half.
		const alone = body('["speakerSortName","speakerJobTitle","sessionFormatId","trackId"]');
		expect(alone).not.toContain('sm:grid-cols-2');
	});

	/**
	 * The two dropdowns are now the shadcn select (#124), which is a button plus a
	 * hidden input rather than a `<select>`. The submitter sees a different
	 * control; the server must not.
	 *
	 * Worth its own assertion because these two are not just answers — they are
	 * the axes CFP-02 conditions are measured against, so a dropped `name` would
	 * take the conditional questions with it and the form would still look right.
	 */
	it('still posts the format and the track through the app-drawn dropdowns', () => {
		const html = render(ProposalForm, {
			props: {
				fields: [],
				fixed: fixedQuestionVisibility(null),
				formats: [{ id: 1, name: 'Talk', minutes: 30 }],
				tracks: [{ id: 2, name: 'Platform' }],
				initial: { ...emptyProposal(), sessionFormatId: 1, trackId: 2 },
				signedIn: true
			}
		}).body;

		expect(html).toContain('data-testid="app-select-sessionFormatId"');
		expect(html).toContain('data-testid="app-select-trackId"');
		// The chosen values, on the inputs that carry them to the action.
		expect(html).toMatch(/value="1"[^>]*name="sessionFormatId"/);
		expect(html).toMatch(/value="2"[^>]*name="trackId"/);
		// And the minutes stay in the label the submitter reads.
		expect(html).toContain('Talk (30 min)');
	});

	it('keeps a space before the required marker on a custom question', () => {
		// Svelte trims a text node that opens a block, so `{#if required} *</span>`
		// used to render as "know?*". An expression keeps the space.
		const html = render(ProposalForm, {
			props: {
				fields: [
					{
						id: 9,
						label: 'What should the audience already know?',
						kind: 'long_text',
						required: true,
						position: 0,
						options: null,
						conditionSource: null,
						conditionFieldId: null,
						conditionValue: null
					}
				],
				fixed: fixedQuestionVisibility(null),
				formats: [],
				tracks: [],
				initial: emptyProposal(),
				signedIn: true
			}
		}).body;

		expect(html).toContain('What should the audience already know?');
		// The space lives in the span: a text node opening `{#if}` would have been trimmed.
		expect(html).toMatch(/already know\?<!--[^>]*--><span class="text-status-bad"> \*</);
	});
});
