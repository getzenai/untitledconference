/** A draft must not claim nobody has seen it — reviewers may already be seated (#614). */
import { emptyProposal } from '$lib/conference/proposal-draft';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const call = {
	state: 'open' as const,
	conference: { name: 'DevFlow Conf 2027' },
	form: { closesAt: new Date('2027-02-15T23:59:00.000Z') },
	fields: [],
	fixed: undefined,
	formats: [],
	tracks: []
};

const draw = (status: string) =>
	render(Page, {
		props: {
			data: {
				call,
				draft: emptyProposal(),
				submissionId: 30,
				status
			}
		} as never
	}).body;

describe('speaker draft edit (#614)', () => {
	it('says the draft is unsubmitted, not that nobody has seen it', () => {
		const body = draw('draft');

		expect(body).toContain('it has not been submitted');
		expect(body).toContain('Reviewers will not see it until you submit');
		expect(body).not.toContain('nobody has seen it');
		expect(body).not.toContain('Nobody has seen it');
	});

	it('does not use the draft claim once the proposal is in', () => {
		const body = draw('in_review');

		expect(body).toContain('already with the organizers');
		expect(body).not.toContain('it has not been submitted');
	});
});
