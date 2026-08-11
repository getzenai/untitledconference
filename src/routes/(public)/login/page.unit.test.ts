import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import ForgotPage from '../forgot-password/+page.svelte';
import RegisterPage from '../register/+page.svelte';
import ResetPage from '../reset-password/+page.svelte';
import LoginPage from './+page.svelte';

// The pages read the current URL for prefill/redirect params. Outside a real
// request there is no SvelteKit context, so both flavours are stubbed.
vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://example.test/reset-password?token=test-token'),
		params: {},
		data: {}
	}
}));
vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('https://example.test/reset-password?token=test-token'),
		params: {},
		data: {}
	})
}));

/**
 * Every auth form must say `method="POST"` in its server-rendered markup.
 *
 * These forms are SPA forms: superForm cancels the native submit — but only
 * once the page has hydrated. Before that, a bare <form> falls back to the
 * browser default, which is GET onto the same URL with every field in the
 * query string. For these four forms the fields are credentials, so the
 * pre-hydration fallback put passwords into browser history and proxy logs.
 * The attribute is the entire fix, which is why a test pins it.
 */
describe('auth forms before hydration', () => {
	const postOnly = (body: string) => {
		const forms = body.match(/<form[^>]*>/g) ?? [];
		expect(forms.length).toBeGreaterThan(0);
		for (const form of forms) {
			expect(form).toContain('method="POST"');
		}
	};

	it('login submits via POST, never GET', () => {
		postOnly(render(LoginPage).body);
	});

	it('register submits via POST, never GET', () => {
		postOnly(render(RegisterPage).body);
	});

	it('reset-password submits via POST, never GET', () => {
		postOnly(render(ResetPage).body);
	});

	it('forgot-password submits via POST, never GET', () => {
		postOnly(render(ForgotPage).body);
	});
});
