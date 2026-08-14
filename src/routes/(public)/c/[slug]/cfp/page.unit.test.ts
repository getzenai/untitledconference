import { ALL_FIXED_QUESTIONS_SHOWN } from '$lib/conference/fixed-questions';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

/**
 * The box a submitter reads before deciding whether to fill the form in (CFP-01).
 *
 * The helpers behind it — `proseBlocks`, the builder field, the public transport —
 * have their own tests. What they cannot see is whether the box is on the page,
 * above the form, and gone once the call is closed. That is the whole point of
 * the feature, so it is what these render.
 */
const call = (
	state: 'open' | 'closed' | 'not_yet_open',
	description: string | null,
	closesAt: Date | null = null
) => ({
	conference: {
		id: 1,
		slug: 'devflow-conf-2027',
		name: 'DevFlow Conf 2027',
		venue: null,
		startsOn: null,
		endsOn: null
	},
	form: {
		id: 7,
		title: 'Call for papers',
		description,
		opensAt: null,
		closesAt
	},
	state,
	fields: [],
	formats: [],
	tracks: [],
	fixed: ALL_FIXED_QUESTIONS_SHOWN
});

const publicConference = {
	id: 'conf-1',
	slug: 'devflow-conf-2027',
	name: 'DevFlow Conf 2027',
	venue: null,
	startsOn: '2027-05-12',
	endsOn: '2027-05-13',
	days: [],
	rooms: [],
	tracks: [],
	formats: [],
	sessions: [],
	speakers: []
};

const renderCfp = (
	state: 'open' | 'closed' | 'not_yet_open',
	description: string | null,
	existing: { id: number; title: string; status: 'draft' | 'submitted' } | null = null,
	closesAt: Date | null = null
) =>
	render(Page, {
		props: {
			data: {
				call: call(state, description, closesAt),
				existing,
				// The public layout's data reaches this page's type but not its body.
				user: undefined,
				conference: publicConference,
				daysUntilClose: null,
				embed: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined }
			},
			form: null
		}
	}).body;

describe('the public call for papers', () => {
	it('shows what submitters need to know, above the form', () => {
		const body = renderCfp(
			'open',
			'We want talks that a practitioner could use on Monday.\n\n- 25 or 45 minutes\n- Travel is covered'
		);

		expect(body).toContain('We want talks that a practitioner could use on Monday.');
		expect(body).toContain('25 or 45 minutes');
		expect(body).toContain('Travel is covered');
		// Above the form: someone who has to scroll past the questions to find out
		// what is being asked has already decided not to submit.
		expect(body.indexOf('Travel is covered')).toBeLessThan(body.indexOf('<form'));
	});

	it('renders the description as text, never as markup', () => {
		const body = renderCfp('open', '<script>alert(1)</script>');

		expect(body).not.toContain('<script>alert(1)</script>');
		// Svelte escapes the opening angle bracket, which is the one that would
		// otherwise start a tag; the closing one is harmless and stays literal.
		expect(body).toContain('&lt;script>alert(1)&lt;/script>');
	});

	/**
	 * #509: a real call is two thousand words with sections and links out. This
	 * page used to render one grey run of text in which a pasted URL was
	 * characters to select and copy.
	 */
	it('gives a long call headings and working links', () => {
		const body = renderCfp(
			'open',
			'## Session formats\n\nSee [past talks](https://ai.engineer/nyc) — acceptance is **5-15%**.'
		);

		// Svelte's server renderer sprinkles comment markers between nodes, so the
		// tag and its text are asserted apart.
		expect(body).toMatch(/<h4[^>]*>[\s\S]*Session formats[\s\S]*<\/h4>/);
		expect(body).toContain('href="https://ai.engineer/nyc"');
		expect(body).toMatch(/<a[^>]*>past talks<\/a>/);
		expect(body).toMatch(/<strong[^>]*>5-15%<\/strong>/);
		// The markers themselves are gone: the reader gets the formatting, not the
		// syntax an organizer typed to ask for it.
		expect(body).not.toContain('## Session formats');
		expect(body).not.toContain('**5-15%**');
	});

	it('refuses a link that is not http, https or mailto', () => {
		// The href is the one value from organizer text that reaches an attribute.
		const body = renderCfp('open', '[Click me](javascript:alert(1))');

		expect(body).not.toContain('href="javascript:');
		expect(body).not.toMatch(/<a[^>]*>Click me<\/a>/);
		// The characters the organizer typed stay on the page, so they can see
		// their link did not take.
		expect(body).toContain('[Click me](javascript:alert(1))');
	});

	it('drops the box once the call has closed', () => {
		const body = renderCfp('closed', 'Travel is covered', null, new Date('2027-04-14T12:00:00Z'));

		expect(body).not.toContain('Travel is covered');
		expect(body).toContain('This call has closed — proposals were accepted until');
	});

	/**
	 * #468: this instant is the 15th in UTC and the 16th in Berlin, and the page
	 * used to print the UTC day with no time and no zone — so the organizer's own
	 * screen named a different day than the speaker's. The deadline decides
	 * whether a talk is accepted, so the moment and its clock both have to show.
	 */
	it('names the closing moment and its zone, not a bare day', () => {
		const body = renderCfp('open', null, null, new Date('2027-02-15T23:59:00Z'));

		expect(body).toContain('Proposals close 15 Feb 2027, 23:59 UTC.');
		expect(body).not.toContain('Monday 15 February 2027');
	});

	it('offers the close date as a calendar download next to the sentence (#510)', () => {
		const body = renderCfp('open', null, null, new Date('2027-02-15T23:59:00Z'));

		expect(body).toContain('href="/c/devflow-conf-2027/cfp.ics"');
		expect(body).toContain('Add to calendar');
		expect(body).toContain('data-testid="cfp-deadline-calendar"');
	});

	it('hides the calendar download once the call has closed', () => {
		const body = renderCfp('closed', null, null, new Date('2027-02-15T23:59:00Z'));

		expect(body).not.toContain('cfp-deadline-calendar');
		expect(body).not.toContain('Add to calendar');
	});

	it('renders the call unchanged when the organizer wrote nothing', () => {
		const body = renderCfp('open', null);

		expect(body).toContain('Call for papers');
		expect(body).toContain('<form');
	});

	it('offers to send the filled form after sign-in, not a blank one (#236)', () => {
		const body = renderCfp('open', null);

		expect(body).toContain('Sign in to submit');
		expect(body).toContain("We'll send this proposal as soon as you sign in.");
		expect(body).toContain('formaction="?/submit"');
	});
});

describe('pointing a returning submitter at what they already sent', () => {
	it('offers to edit the submitted proposal rather than inviting a second', () => {
		const body = renderCfp('open', null, { id: 42, title: 'Taming CI', status: 'submitted' });

		// The duplicate pairs in the organizer's list came from exactly this screen:
		// a blank form was the only way back in, so amending meant re-submitting.
		expect(body).toContain('You already sent a proposal to this call');
		expect(body).toContain('/portal/submissions/42/edit');
		expect(body).toContain('would send a second');
	});

	it('words an unfinished draft differently', () => {
		const body = renderCfp('open', null, { id: 43, title: 'Half a thought', status: 'draft' });

		expect(body).toContain('You already have an unfinished proposal here');
		expect(body).toContain('/portal/submissions/43/edit');
	});

	it('says nothing when there is nothing to point at', () => {
		const body = renderCfp('open', null);

		expect(body).not.toContain('You already');
	});
});
