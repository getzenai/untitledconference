/**
 * Opening a session is a URL, so Back closes the overlay instead of leaving
 * the site. The page used to keep the open session in local state only.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

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

async function draw(search = '') {
	currentUrl.value = new URL(`https://example.test/c/short-cards/agenda${search}`);
	const { default: Page } = await import('./+page.svelte');
	return render(Page, {
		props: { data: { conference, embed: false } as never }
	}).body;
}

describe('public agenda session URL', () => {
	it('opens the session from ?session= instead of the grid', async () => {
		const html = await draw('?session=session-1');

		expect(html).toContain('Back to agenda');
		expect(html).toContain('Four hundred engineers, one repository');
		expect(html).toContain('What actually breaks at that size.');
		expect(html).not.toContain('aria-label="Conference days"');
	});

	it('stays on the grid when the URL names no session', async () => {
		const html = await draw();

		expect(html).not.toContain('Back to agenda');
		expect(html).toContain('aria-label="Conference days"');
		// The talk is on day 2; day 1 is empty. The point is the overlay is closed.
		expect(html).toContain('Nothing is scheduled on this day yet.');
	});
});
