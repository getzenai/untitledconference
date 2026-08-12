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

function page(status: 'assigned' | 'submitted', submissionStatus = 'in_review') {
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
					own: { reviewId: 42, status, comment: null },
					criteria: [],
					peers: [],
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
		const body = page('assigned', 'withdrawn');

		expect(body).toContain('The speaker withdrew this talk, so it no longer needs a review.');
		expect(body).toContain('Withdrawn');
		// Both write paths, not just the prominent one.
		expect(body.match(/disabled/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
	});

	it('leaves the form open on a talk that is still live', () => {
		const body = page('assigned', 'in_review');

		expect(body).not.toContain('no longer needs a review');
	});
});
