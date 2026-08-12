import { roundWindow } from '$lib/conference/round-window';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
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
		/** The round's window (ABS-01); no dates means a round that is simply open. */
		window?: ReturnType<typeof roundWindow>;
	} = {}
) {
	const submissionStatus = opts.submissionStatus ?? 'in_review';
	const peers = opts.peers ?? [];
	const window = opts.window ?? roundWindow(null, null);
	return render(Page, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Riley' },
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
					peersWithheld: false
				}
			} as PageData,
			form: null
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
