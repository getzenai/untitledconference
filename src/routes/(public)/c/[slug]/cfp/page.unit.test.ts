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
	fixed: ALL_FIXED_QUESTIONS_SHOWN,
	support: {}
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
	closesAt: Date | null = null,
	extras: {
		user?: { id: string };
		speakerProfile?: {
			organizationName: string;
			speaker: {
				name: string;
				sortName: string;
				email: string;
				jobTitle: string;
				company: string;
				bio: string;
			};
		} | null;
	} = {}
) =>
	render(Page, {
		props: {
			data: {
				call: call(state, description, closesAt),
				existing,
				pendingProposal: null,
				speakerProfile: extras.speakerProfile ?? null,
				// The public layout's data reaches this page's type but not its body.
				user: extras.user,
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

	it('says what stays on this call, and where, without calling it saved (#801)', () => {
		const body = renderCfp('open', null);

		expect(body).toContain('data-testid="cfp-draft-hint"');
		expect(body).toContain(
			'Only what you filled in on this call will stay in this browser on this device.'
		);
		expect(body).not.toMatch(/Drafts are saved/i);
		expect(body.indexOf('data-testid="cfp-draft-hint"')).toBeLessThan(body.indexOf('<form'));
	});

	it('offers to send the filled form after sign-in, not a blank one (#236)', () => {
		const body = renderCfp('open', null);

		expect(body).toContain('Sign in to submit');
		expect(body).toContain('Save as draft');
		expect(body).toContain("We'll save your choice as soon as you sign in or create an account.");
		expect(body).toContain('formaction="?/submit"');
		expect(body).toContain('formaction="?/draft"');
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

	it('keeps the stay-hint on the form after the first proposal is submitted (#819)', () => {
		const body = renderCfp(
			'open',
			null,
			{ id: 42, title: 'Taming CI', status: 'submitted' },
			null,
			{ user: { id: 'speaker-1' } }
		);

		// Path taken: the form stays, so the sentence stays. Cypress holds
		// that persist actually writes. Hiding the hint would be the other
		// honest option — this test locks the one we took.
		expect(body).toContain('You already sent a proposal to this call');
		expect(body).toContain('data-testid="cfp-draft-hint"');
		expect(body).toContain('<form');
	});

	it('keeps the stay-hint on the form while the first proposal is in review (#819)', () => {
		const body = renderCfp(
			'open',
			null,
			{ id: 77, title: 'Still with the committee', status: 'in_review' },
			null,
			{ user: { id: 'speaker-1' } }
		);

		expect(body).toContain('You already sent a proposal to this call');
		expect(body).toContain('data-testid="cfp-draft-hint"');
		expect(body).toContain('<form');
	});

	it('words an unfinished draft differently', () => {
		const body = renderCfp(
			'open',
			null,
			{ id: 43, title: 'Half a thought', status: 'draft' },
			null,
			{ user: { id: 'speaker-1' } }
		);

		expect(body).toContain('data-testid="cfp-existing-draft"');
		expect(body).toContain('Continue your draft');
		expect(body).toContain('Half a thought is still private');
		expect(body).toContain('/portal/submissions/43/edit');
		expect(body).toContain('data-testid="cfp-start-another"');
		expect(body).not.toContain('<form');
		// The stay-hint belongs on the form it describes. Until Start another
		// is clicked it would sit over Continue your draft and lie (#815).
		expect(body).not.toContain('data-testid="cfp-draft-hint"');
	});

	it('says nothing when there is nothing to point at', () => {
		const body = renderCfp('open', null);

		expect(body).not.toContain('You already');
	});
});

describe('signing in from the public call (#558)', () => {
	it('offers sign-in as a door, not as a grey caveat', () => {
		const body = renderCfp('open', null);

		expect(body).toContain('data-testid="cfp-sign-in"');
		expect(body).toContain('Sign in to submit — or to reuse a speaker profile.');
		expect(body).toContain('href="/login?returnTo=/c/devflow-conf-2027/cfp"');
		expect(body).not.toContain('you will need to');
		// The form's own submit still says the same thing it did before — two
		// doors, same destination, so a filled form is not a dead end.
		expect(body).toContain('Sign in to submit');
	});

	it('drops the door once they are signed in', () => {
		const body = renderCfp('open', null, null, null, { user: { id: 'user-1' } });

		expect(body).not.toContain('data-testid="cfp-sign-in"');
		expect(body).not.toContain('reuse a speaker profile');
	});
});

describe('prefilling a speaker who already has a profile (#558)', () => {
	const priya = {
		organizationName: 'Northwind',
		speaker: {
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: 'priya@example.test',
			jobTitle: 'Staff Engineer',
			company: 'Northwind Labs',
			bio: 'Works on build systems.'
		}
	};

	it('fills the About-you fields and names the profile they came from', () => {
		const body = renderCfp('open', null, null, null, {
			user: { id: 'user-1' },
			speakerProfile: priya
		});

		expect(body).toContain('data-testid="cfp-profile-source"');
		expect(body).toContain('your speaker profile at Northwind');
		expect(body).toContain('value="Priya Raman"');
		expect(body).toContain('value="Raman, Priya"');
		expect(body).toContain('value="priya@example.test"');
		expect(body).toContain('value="Staff Engineer"');
		expect(body).toContain('value="Northwind Labs"');
		expect(body).toContain('Works on build systems.');
	});

	// The write is org-wide. If this sentence is missing, a bio typed for talk B
	// silently rewrites talk A — the failure #558 part 2 is there to stop.
	it('names the write scope before they can submit', () => {
		const body = renderCfp('open', null, null, null, {
			user: { id: 'user-1' },
			speakerProfile: priya
		});

		const notice = body
			.slice(body.indexOf('data-testid="cfp-profile-source"'))
			.replace(/\s+/g, ' ');
		expect(notice).toContain('every talk you give this organizer');
		expect(notice).toContain('not just this proposal');
	});

	it('says nothing about a profile when there is none', () => {
		const signedOut = renderCfp('open', null);
		const signedIn = renderCfp('open', null, null, null, { user: { id: 'user-1' } });

		expect(signedOut).not.toContain('cfp-profile-source');
		expect(signedOut).not.toContain('your speaker profile at');
		expect(signedIn).not.toContain('cfp-profile-source');
		expect(signedIn).not.toContain('your speaker profile at');
	});
});

describe('speaker expenses on the public call (#512)', () => {
	const withSupport = (state: 'open' | 'closed', support: { admission?: 'free' }) => {
		const base = call(state, state === 'closed' ? 'Travel is covered' : null);
		return render(Page, {
			props: {
				data: {
					call: { ...base, support },
					existing: null,
					pendingProposal: null,
					speakerProfile: null,
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
	};

	it('renders nothing when the call has not answered', () => {
		const body = withSupport('open', {});
		expect(body).not.toContain('data-testid="speaker-support"');
		expect(body).not.toContain('Speaker expenses');
	});

	it('shows a labelled block for what was set, and keeps it after the call closes', () => {
		const open = withSupport('open', { admission: 'free' });
		expect(open).toContain('data-testid="speaker-support"');
		expect(open).toContain('Speaker expenses');
		expect(open).toContain('Free for speakers');

		const closed = withSupport('closed', { admission: 'free' });
		expect(closed).toContain('This call has closed');
		expect(closed).not.toContain('Travel is covered');
		expect(closed).toContain('Free for speakers');
		expect(closed).toContain('data-testid="speaker-support"');
	});

	it('puts the expenses under the description, not over it (#591)', () => {
		const base = call('open', 'Talks that show the work.');
		const body = render(Page, {
			props: {
				data: {
					call: { ...base, support: { admission: 'free' } },
					existing: null,
					pendingProposal: null,
					speakerProfile: null,
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
		const intro = body.indexOf('Talks that show the work.');
		const expenses = body.indexOf('data-testid="speaker-support"');
		expect(intro).toBeGreaterThan(-1);
		expect(intro).toBeLessThan(expenses);
	});
});
