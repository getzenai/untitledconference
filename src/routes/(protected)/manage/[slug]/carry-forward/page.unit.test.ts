/**
 * The organizer has to find the lane and work it without a walkthrough.
 *
 * Three paints: no predecessor (the door to the field), a rejected talk
 * with score and comments on the line, and a persisted invite that still
 * shows after the write.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = { id: 2, name: 'DevFlow 2028', slug: 'devflow-2028' };

const row = {
	submissionId: 11,
	title: 'The near miss',
	speakers: [{ id: 4, name: 'Ada Speaker' }],
	score: 4.5,
	comments: ['Strong, bring them back.'],
	declineNote: 'Did not fit the slot count.',
	disposition: null as 'invited' | 'discarded' | null
};

const renderWith = (
	lane: {
		predecessor: { id: number; name: string; slug: string } | null;
		rows: (typeof row)[];
	},
	form: { message?: string } | null = null
) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				lane
			},
			form
		} as never
	}).body;

describe('carry-forward page', () => {
	it('points at the previous-edition field when none is set', () => {
		const body = renderWith({ predecessor: null, rows: [] });

		expect(body).toContain('No previous edition set');
		expect(body).toContain('href="/manage"');
		expect(body).toContain('Set the previous edition');
		expect(body).not.toContain('data-testid="carry-forward-list"');
	});

	it('puts the old score and the committee comments on the declined row', () => {
		const body = renderWith({
			predecessor: { id: 1, name: 'DevFlow 2027', slug: 'devflow-2027' },
			rows: [row]
		});

		expect(body).toContain('data-testid="carry-forward-list"');
		expect(body).toContain('The near miss');
		expect(body).toContain('Ada Speaker');
		expect(body).toContain('4.5');
		expect(body).toContain('Strong, bring them back.');
		expect(body).toContain('Did not fit the slot count.');
		expect(body).toContain('href="/manage/devflow-2027/submissions/11"');
		expect(body).toContain('action="?/invite"');
		expect(body).toContain('action="?/discard"');
		expect(body).toContain('data-testid="carry-forward-invite"');
		expect(body).toContain('data-testid="carry-forward-discard"');
	});

	it('keeps an invited row on the list after the write', () => {
		const body = renderWith({
			predecessor: { id: 1, name: 'DevFlow 2027', slug: 'devflow-2027' },
			rows: [{ ...row, disposition: 'invited' }]
		});

		expect(body).toContain('The near miss');
		expect(body).toContain('On the invite list');
		expect(body).toContain('data-testid="carry-forward-invite"');
		expect(body).toContain('disabled');
	});
});
