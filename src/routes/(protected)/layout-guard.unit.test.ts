import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { load } from './+layout.server';

vi.mock('$lib/server/conference/nav-access', () => ({
	navAccess: async () => ({ conferences: [] })
}));

const chatFlag = vi.hoisted(() => ({ on: false }));
vi.mock('$lib/server/feature-flags', () => ({
	isFeatureEnabled: (name: string) => name === 'inAppChat' && chatFlag.on
}));

function signedOutLoad(href: string) {
	return (load as (event: unknown) => Promise<unknown>)({
		url: new URL(href),
		locals: {}
	});
}

function signedInLoad(href: string) {
	return (load as (event: unknown) => Promise<{ chatEnabled?: boolean }>)({
		url: new URL(href),
		locals: { user: { id: 'u1', email: 'organizer@example.com' } }
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

describe('the assistant flag on the shell', () => {
	// The star opens `POST /chat`, which is 404 without FEATURE_INAPP_CHAT.
	// A button that can only fail is worse than no button (#676).
	it('is off while the feature is off', async () => {
		chatFlag.on = false;
		expect((await signedInLoad('https://app.example.com/home')).chatEnabled).toBe(false);
	});

	it('is on once the feature is on', async () => {
		chatFlag.on = true;
		expect((await signedInLoad('https://app.example.com/home')).chatEnabled).toBe(true);
	});
});
