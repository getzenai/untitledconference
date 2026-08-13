/**
 * The document title used to stay empty on login and register: AuthShell
 * painted the heading in the card and never wrote <title>.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AuthShell from './auth-shell.svelte';

describe('auth shell', () => {
	it('puts the card heading in the document title', () => {
		const { head } = render(AuthShell, {
			props: {
				title: 'Sign in',
				description: 'Use the account you registered with.',
				children: (() => '') as unknown as import('svelte').Snippet
			}
		});

		expect(head).toContain('<title>Sign in — untitledconference</title>');
	});
});
