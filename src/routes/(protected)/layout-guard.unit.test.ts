import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

function signedOutLoad(href: string) {
	return (load as (event: unknown) => Promise<unknown>)({
		url: new URL(href),
		locals: {}
	});
}

describe('the protected layout without a session', () => {
	it('keeps ?round= on a review permalink through the login redirect', async () => {
		// A signed-out /review/<conf>/<id>?round=2 used to go to
		// /login?returnTo=/review/<conf>/<id>. After sign-in, ownReview falls
		// back to the first open round, so the reviewer scores the wrong
		// scorecard and nothing says so (#356).
		const thrown = (await signedOutLoad('https://app.example.com/review/example/1?round=2').then(
			() => undefined,
			(e: unknown) => e
		)) as { status: number; location: string };

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe(
			`/login?returnTo=${encodeURIComponent('/review/example/1?round=2')}`
		);
	});
});
