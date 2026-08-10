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

function page(status: 'assigned' | 'submitted') {
	return render(Page, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Riley' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submission: {
					id: 7,
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
});
