/**
 * Opening a session is a URL, so Back closes the overlay instead of leaving
 * the site. The page used to keep the open session in local state only.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { render } from 'svelte/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const currentUrl = vi.hoisted(() => ({
	value: new URL('https://example.test/c/short-cards/agenda')
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return currentUrl.value;
		}
	}
}));

const conference = {
	id: 'conf-1',
	slug: 'short-cards',
	name: 'Short Cards Conf',
	venue: 'The Building',
	startsOn: '2027-06-01',
	endsOn: '2027-06-02',
	days: [
		{ id: 'day-1', date: '2027-06-01', label: 'Day 1' },
		{ id: 'day-2', date: '2027-06-02', label: 'Day 2' }
	],
	rooms: [{ id: 'room-1', name: 'Main Stage' }],
	tracks: [],
	formats: [],
	sessions: [
		{
			id: 'session-1',
			title: 'Four hundred engineers, one repository',
			description: 'What actually breaks at that size.',
			dayId: 'day-2',
			startsAt: '2027-06-02T09:00:00.000Z',
			endsAt: '2027-06-02T09:30:00.000Z',
			roomId: 'room-1',
			trackId: null,
			formatId: null,
			speakerIds: [],
			recordingUrl: null
		}
	],
	speakers: []
} satisfies PublicConference;

/**
 * Compiled once, in a hook, on purpose: the first `import()` costs ~5.2s of
 * Vite compile while the render it times takes ~7ms, and the 5000ms default
 * sits inside that spread (#770). A hook has its own budget.
 */
let Page: (typeof import('./+page.svelte'))['default'];

beforeAll(async () => {
	({ default: Page } = await import('./+page.svelte'));
});

function draw(search = '') {
	currentUrl.value = new URL(`https://example.test/c/short-cards/agenda${search}`);
	return render(Page, {
		props: { data: { conference, embed: false } as never }
	}).body;
}

describe('public agenda session URL', () => {
	it('opens the session from ?session= instead of the grid', () => {
		const html = draw('?session=session-1');

		expect(html).toContain('Back to agenda');
		expect(html).toContain('Four hundred engineers, one repository');
		expect(html).toContain('What actually breaks at that size.');
		expect(html).not.toContain('aria-label="Conference days"');
	});

	it('stays on the grid when the URL names no session', () => {
		const html = draw();

		expect(html).not.toContain('Back to agenda');
		expect(html).toContain('aria-label="Conference days"');
		// The talk is on day 2, and the agenda opens on the first day that has
		// one, so the grid — not the overlay — is what a visitor lands on.
		expect(html).toContain('Four hundred engineers, one repository');
		expect(html).toMatch(/aria-selected="true"[^>]*>Day 2</);
	});
});
