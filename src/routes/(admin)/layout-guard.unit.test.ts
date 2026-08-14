import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

function signedOutLoad(href: string) {
	return (load as (event: unknown) => Promise<unknown>)({
		url: new URL(href),
		locals: {}
	});
}

describe('the admin layout without a session', () => {
	it('keeps the query on an admin URL through the login redirect', async () => {
		// Twin of #356 on the protected layout: a signed-out /admin/users?page=2
		// used to go to /login?returnTo=/admin/users. After sign-in the tab and
		// page are gone, and nothing says so (#365).
		const thrown = (await signedOutLoad('https://app.example.com/admin/users?page=2').then(
			() => undefined,
			(e: unknown) => e
		)) as { status: number; location: string };

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe(`/login?returnTo=${encodeURIComponent('/admin/users?page=2')}`);
	});
});
