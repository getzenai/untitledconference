/**
 * The reviewer's conference shell deliberately carries no organizer navigation
 * (CFP-10), and that is what left a reviewer with no way out (#71). One link back
 * to their own list of assignments is the exit — and it must not grow into a rail.
 */
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Layout from './+layout.svelte';

const body = () =>
	render(Layout, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Sam' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference: {
					slug: 'devflow-conf-2027',
					name: 'DevFlow Conf 2027',
					reviewVisibility: 'open' as const
				}
			},
			children: createRawSnippet(() => ({ render: () => '<p>queue</p>' }))
		}
	}).body;

describe('the reviewer shell', () => {
	it('offers a way back to the reviewer’s own list', () => {
		const shell = body();

		expect(shell).toContain('data-testid="review-back"');
		expect(shell).toContain('href="/review"');
		expect(shell).toContain('queue');
	});

	it('still carries no organizer navigation', () => {
		const shell = body();

		expect(shell).not.toContain('href="/manage"');
		expect(shell).not.toContain('Submissions');
		expect(shell).not.toContain('Speaker content');
	});
});
