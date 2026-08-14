import { roundWindow } from '$lib/conference/round-window';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { ActionData, PageData } from './$types';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	status: 'published' as const,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

type Peer = {
	id: number;
	reviewer: string;
	roundName: string;
	submitted: boolean;
	comment: string | null;
	submittedAt: Date | null;
	scores: { criterion: string; value: number | null; valueText: string | null }[];
	score: number | null;
};

type Criterion = {
	id: number;
	label: string;
	kind: string;
	scaleMax: number | null;
	options: string | null;
	value: number | null;
	valueText: string | null;
};

function page(
	status: 'assigned' | 'submitted',
	opts: {
		submissionStatus?: string;
		peers?: Peer[];
		criteria?: Criterion[];
		answers?: { label: string; kind: string; value: string | null }[];
		form?: ActionData;
		/** The round's window (ABS-01); no dates means a round that is simply open. */
		window?: ReturnType<typeof roundWindow>;
		/** Every round this reviewer holds the talk in (#294). One unless stated. */
		heldRounds?: {
			id: number;
			name: string;
			window: ReturnType<typeof roundWindow>;
			submitted: boolean;
		}[];
	} = {}
) {
	const submissionStatus = opts.submissionStatus ?? 'in_review';
	const peers = opts.peers ?? [];
	const window = opts.window ?? roundWindow(null, null);
	return render(Page, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Riley' },
				// Shell data (#239); this page renders inside the sidebar layout.
				navAccess: {
					conferences: false,
					contacts: false,
					reviewing: true,
					reviewSlug: 'test-conf',
					speakerProfile: false
				},
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submission: {
					id: 7,
					status: submissionStatus,
					title: 'A review worth doing',
					abstract: 'Details.',
					keyTakeaway: null,
					audienceLevel: null,
					track: null,
					sessionFormat: null,
					speakers: [],
					anonymized: false,
					window,
					own: { reviewId: 42, status, comment: null },
					criteria: opts.criteria ?? [],
					peers,
					peersPending: 0,
					peersWithheld: false,
					answers: opts.answers ?? [],
					round: { id: 1, name: 'Screening' },
					heldRounds: opts.heldRounds ?? [
						{ id: 1, name: 'Screening', window, submitted: status === 'submitted' }
					]
				}
			} as PageData,
			form: opts.form ?? null
		}
	}).body;
}

describe('reviewer recusal', () => {
	it('offers recusal while the assigned review is outstanding', () => {
		const body = page('assigned');

		expect(body).toContain('formaction="?/recuse"');
		expect(body).toContain('name="reviewId"');
		expect(body).toContain('value="42"');
		expect(body).toContain('Recuse myself');
	});

	it('does not offer recusal after submission', () => {
		expect(page('submitted')).not.toContain('Recuse myself');
	});

	/**
	 * The confirm step itself is not assertable here and the E2E spec carries it
	 * (#463): a closed `AlertDialog` renders nothing on the server, so any markup
	 * this test could look for would be markup that proves nothing about whether
	 * the dialog actually gates the submit. What SSR *can* promise is that the
	 * button still posts — the dialog is a courtesy to the reviewer, not the
	 * guard, and a browser without JS keeps the old one-click path rather than
	 * losing the control entirely.
	 */
	it('keeps recusal working without JavaScript, dialog or not (#463)', () => {
		const body = page('assigned');

		expect(body).toContain('formaction="?/recuse"');
		expect(body).toContain('type="submit"');
	});

	it('labels a filed review as an update, not a first submit', () => {
		const filed = page('submitted');
		expect(filed).toContain('Update review');
		expect(filed).not.toContain('Submit review');
		// intent values stay the same so the action path is unchanged
		expect(filed).toContain('name="intent"');
		expect(filed).toContain('value="submit"');
	});

	it('keeps the first-submit wording while the review is still a draft', () => {
		const draft = page('assigned');
		expect(draft).toContain('Submit review');
		expect(draft).not.toContain('Update review');
	});
});

/**
 * The other half of RV-P1-01: reaching the form directly. Hiding the buttons is
 * not the guard — `saveReview` refuses a withdrawn talk on the server — but a page
 * that still invites the work is the reason someone does it.
 */
describe('the form on a withdrawn talk', () => {
	it('says why it is closed and disables both writes', () => {
		const body = page('assigned', { submissionStatus: 'withdrawn' });

		expect(body).toContain('The speaker withdrew this talk, so it no longer needs a review.');
		expect(body).toContain('Withdrawn');
		// All write paths, including recuse (#183): recusing would erase the
		// withdrawn queue row that #180 deliberately keeps visible.
		expect(body.match(/disabled/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
		// disabled= lands before formaction in the rendered button markup.
		expect(body).toMatch(/disabled=""[^>]*formaction="\?\/recuse"/);
	});

	it('leaves the form open on a talk that is still live', () => {
		const body = page('assigned', { submissionStatus: 'in_review' });

		expect(body).not.toContain('no longer needs a review');
	});
});

/**
 * ABS-01 on the page. The guard is `saveReview`, not this markup — but a form that
 * still invites answers after the round shut is why somebody types them.
 */
describe('the form outside the round window', () => {
	const day = 86_400_000;
	const now = new Date('2027-03-10T12:00:00Z');

	it('says when a not-yet-open round opens and disables both writes', () => {
		const body = page('assigned', {
			window: roundWindow(new Date(now.getTime() + 2 * day), null, now)
		});

		expect(body).toContain('data-testid="round-window-notice"');
		expect(body).toContain('This review round opens in 2 days');
		expect(body).toContain('Nothing can be filed until then.');
		// Submit and save progress, both dead; recuse stays live because the server
		// still accepts it.
		expect(body).toMatch(/disabled=""[^>]*name="intent"/);
		expect(body).not.toMatch(/disabled=""[^>]*formaction="\?\/recuse"/);
	});

	it('says a closed round is closed', () => {
		const body = page('assigned', {
			window: roundWindow(null, new Date(now.getTime() - day), now)
		});

		expect(body).toContain('This review round closed on');
		expect(body).toContain('Reviews can no longer be filed or changed.');
		expect(body).toMatch(/disabled=""[^>]*name="intent"/);
	});

	it('leaves the form open while the round is running', () => {
		const body = page('assigned', {
			window: roundWindow(new Date(now.getTime() - day), new Date(now.getTime() + day), now)
		});

		expect(body).not.toContain('data-testid="round-window-notice"');
		expect(body).not.toMatch(/disabled=""[^>]*name="intent"/);
	});
});

describe('peer review display', () => {
	it('renders every peer under Reviewer N with a round name and Comment label', () => {
		const body = page('submitted', {
			peers: [
				{
					id: 1,
					reviewer: 'Reviewer 1',
					roundName: 'Round 1 — Screening',
					submitted: true,
					comment: 'Solid but familiar.',
					submittedAt: new Date('2027-02-20T00:00:00Z'),
					scores: [
						{ criterion: 'Programme fit', value: 3, valueText: null },
						{
							criterion: 'How it sits in the programme',
							value: null,
							valueText: 'Tighten abstract.'
						}
					],
					score: 3
				},
				{
					id: 2,
					reviewer: 'Reviewer 2',
					roundName: 'Round 2 — Final',
					submitted: true,
					comment: null,
					submittedAt: new Date('2027-02-21T00:00:00Z'),
					scores: [{ criterion: 'Relevance', value: 5, valueText: null }],
					score: 5
				}
			]
		});

		expect(body).toContain('data-testid="peer-review"');
		expect(body).toContain('Reviewer 1');
		expect(body).toContain('Reviewer 2');
		expect(body).toContain('Round 1 — Screening');
		expect(body).toContain('Round 2 — Final');
		expect(body).toContain('Programme fit');
		expect(body).toContain('Relevance');
		// Same heading as the form, so a reviewer can tell which box lands here.
		expect(body).toContain('Overall comment');
		expect(body).toContain('Solid but familiar.');
		// No real-name leak fixtures
		expect(body).not.toContain('Inés');
		expect(body).not.toContain('Delgado');
	});
});

/**
 * #241: two prose boxes on one form used to share the word "Comment" / "Notes".
 * They are different things; the labels have to say so.
 */
describe('the two prose boxes (#241)', () => {
	it('names the overall comment and says who reads it', () => {
		const body = page('assigned');

		expect(body).toContain('Overall comment');
		expect(body).toContain('Your verdict on this talk.');
		expect(body).toContain('unless the round is anonymised');
		expect(body).toContain('name="comment"');
	});

	it('marks a free-text criterion as part of the scorecard, not the comment', () => {
		const body = page('assigned', {
			criteria: [
				{
					id: 9,
					label: 'Where it fits the programme',
					kind: 'text',
					scaleMax: null,
					options: null,
					value: null,
					valueText: null
				}
			]
		});

		expect(body).toContain('Where it fits the programme');
		expect(body).toContain("Part of this round's scorecard — not the overall comment below.");
		expect(body).toContain('name="criterion-9"');
		// A rating does not get that line: only the text box can be mistaken for
		// the comment.
		expect(body).not.toContain('This round has no scorecard yet');
	});
});

describe('custom CFP answers on the scorecard', () => {
	it('renders the extra form answers the reviewer used to score without', () => {
		const body = page('assigned', {
			answers: [
				{ label: 'Have you given this talk before?', kind: 'boolean', value: 'true' },
				{ label: 'Anything else?', kind: 'long_text', value: 'I need a lectern.' }
			]
		});

		expect(body).toContain('What they answered on the form');
		expect(body).toContain('Have you given this talk before?');
		expect(body).toContain('>Yes</dd>');
		expect(body).not.toContain('>true</dd>');
		expect(body).toContain('I need a lectern.');
	});
});

describe('form messages', () => {
	it('paints a failure red, not green', () => {
		const body = page('assigned', {
			form: {
				message:
					'Answer at least one criterion, or write a comment, before submitting — submitting is what reveals the other reviews.'
			}
		});

		expect(body).toContain('border-status-bad');
		expect(body).toContain('role="alert"');
		expect(body).not.toContain('border-status-good');
	});

	it('paints a successful save green', () => {
		const body = page('assigned', {
			form: { ok: true, message: 'Progress saved. It does not count as a review yet.' }
		});

		expect(body).toContain('border-status-good');
		expect(body).toContain('role="status"');
		expect(body).not.toContain('border-status-bad');
	});
});

/**
 * #294: one talk, two open rounds, two different scorecards — and one URL. The
 * page has to name the round it is showing and offer the other, or the second
 * round's form cannot be reached from anywhere.
 */
describe('a talk held in two rounds', () => {
	const both = [
		{ id: 1, name: 'Screening', window: roundWindow(null, null), submitted: false },
		{ id: 2, name: 'Committee', window: roundWindow(null, null), submitted: false }
	];

	it('names the round the form writes to, and links the other one', () => {
		const body = page('assigned', { heldRounds: both });

		expect(body).toContain('My review — Screening');
		expect(body).toContain('data-testid="round-link-2"');
		expect(body).toContain('href="?round=2"');
		expect(body).toContain('aria-current="page"');
	});

	it('sends the round with the answers, not just in the address bar', () => {
		const body = page('assigned', { heldRounds: both });

		// A POST to a bare `?/save` would carry no round at all, and the answers
		// would land in whichever round the priority rule picks — silently.
		expect(body).toContain('name="roundId"');
		// `&` is escaped in the attribute; the browser still sends `round=1`.
		expect(body).toContain('action="?/save&amp;round=1"');
	});

	it('says nothing about rounds when there is only one', () => {
		const body = page('assigned');

		expect(body).not.toContain('data-testid="round-link-2"');
	});
});
