/**
 * #390: the ban confirmation and the banned row must name the cookieCache
 * window, and the number has to come from SESSION_COOKIE_CACHE_MAX_AGE_SECONDS.
 * A hardcoded "5 minutes" would drift the day someone turns the constant.
 */
import { SESSION_COOKIE_CACHE_MAX_AGE_SECONDS } from '$lib/constants';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';
import { banTakesEffectCopy } from './ban-copy';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '+page.svelte'), 'utf8');

const currentUser = {
	id: 'admin-1',
	name: 'Ada',
	email: 'ada@example.test',
	role: 'admin',
	banned: false,
	banReason: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	emailVerified: true
};

const bannedUser = {
	id: 'user-banned',
	name: 'Banned Ben',
	email: 'ben@example.test',
	role: 'user',
	banned: true,
	banReason: 'Banned by administrator',
	createdAt: new Date('2026-02-01T00:00:00Z'),
	emailVerified: true
};

function renderUsersPage() {
	return render(Page, {
		props: {
			data: {
				currentUser,
				users: [currentUser, bannedUser],
				stats: { totalUsers: 2, bannedUsers: 1, adminUsers: 1 },
				invitations: []
			},
			form: null
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	}).body;
}

describe('admin ban copy (#390)', () => {
	it('renders the window from SESSION_COOKIE_CACHE_MAX_AGE_SECONDS, not a hardcoded 5 minutes', () => {
		const copy = banTakesEffectCopy();
		const minutes = SESSION_COOKIE_CACHE_MAX_AGE_SECONDS / 60;
		expect(copy).toBe(`A session already signed in stays valid for up to ${minutes} minutes.`);
		expect(copy).toContain(String(minutes));
		expect(banTakesEffectCopy(60)).toBe(
			'A session already signed in stays valid for up to 1 minute.'
		);
		expect(banTakesEffectCopy(90)).toBe(
			'A session already signed in stays valid for up to 90 seconds.'
		);

		const html = renderUsersPage();
		expect(html).toContain(copy);
		expect(html).toContain('Banned');

		// The confirmation dialog is the other surface the operator actually reads.
		// It is closed on first paint, so the SSR body may not include it — the
		// markup still has to call the same function, not spell "5 minutes".
		expect(source).toContain('{banTakesEffectCopy()}');
		expect(source).toMatch(/New sign-ins are blocked immediately\.\s*\{banTakesEffectCopy\(\)\}/);
		expect(source).not.toMatch(/5 minutes/);
	});
});
