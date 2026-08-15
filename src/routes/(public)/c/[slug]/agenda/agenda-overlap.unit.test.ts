/**
 * Two talks in one room at one minute, and a day that does not start on a round
 * clock time — the other two halves of #588.
 *
 * The grid used to give every session the whole room column, so an overlap drew
 * one title over the other and made both unreadable; and the gutter counted in
 * 30-minute steps from the earliest talk, so an agenda opening at 09:05 was
 * labelled 09:05 / 09:35 / 10:05.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/c/overlap/agenda') }
}));

const session = (id: string, title: string, from: string, to: string) => ({
	id,
	title,
	description: 'What actually breaks at that size.',
	dayId: 'day-1',
	startsAt: `2027-06-01T${from}:00.000Z`,
	endsAt: `2027-06-01T${to}:00.000Z`,
	roomId: 'room-1',
	trackId: null,
	formatId: null,
	speakerIds: [],
	recordingUrl: null
});

const conference = (sessions: ReturnType<typeof session>[]) =>
	({
		id: 'conf-1',
		slug: 'overlap',
		name: 'Overlap Conf',
		venue: 'The Building',
		startsOn: '2027-06-01',
		endsOn: '2027-06-01',
		days: [{ id: 'day-1', date: '2027-06-01', label: 'Day 1' }],
		rooms: [{ id: 'room-1', name: 'Keynote' }],
		tracks: [],
		formats: [],
		sessions,
		speakers: []
	}) satisfies PublicConference;

const html = (sessions: ReturnType<typeof session>[]) =>
	render(Page, {
		props: { data: { conference: conference(sessions), embed: false } as never }
	}).body;

const cards = (page: string) => page.match(/<button[^>]*grid-column[^>]*>/g) ?? [];

describe('public agenda, two talks in one room', () => {
	it('splits the room column instead of stacking the second title on the first', () => {
		const page = html([
			session('a', 'Agents in production', '09:00', '10:00'),
			session('b', 'Containing agents', '09:50', '10:20')
		]);
		const drawn = cards(page);

		expect(drawn).toHaveLength(2);
		for (const card of drawn) {
			expect(card).toContain('width: calc(100% / 2 - 2px)');
		}
		// Side by side, not one on top of the other: different offsets.
		expect(drawn[0]).toContain('margin-left: calc(100% * 0 / 2 + 1px)');
		expect(drawn[1]).toContain('margin-left: calc(100% * 1 / 2 + 1px)');
	});

	it('leaves a day without a clash exactly as wide as it was', () => {
		const drawn = cards(
			html([
				session('a', 'Agents in production', '09:00', '10:00'),
				session('b', 'Containing agents', '10:00', '10:30')
			])
		);

		expect(drawn).toHaveLength(2);
		for (const card of drawn) {
			expect(card).not.toContain('margin-left');
			expect(card).not.toContain('width: calc');
		}
	});
});

describe('public agenda gutter', () => {
	it('labels round half hours even when the first talk starts at 09:05', () => {
		const page = html([session('a', 'A year of Gemini', '09:05', '09:20')]);
		// Only the gutter: 09:05 is still the card's own time, in its label.
		const labels = [...page.matchAll(/tabular-nums"[^>]*>([\d:]+)</g)].map((m) => m[1]);

		expect(labels).toEqual(['09:00']);
	});

	it('keeps the card on its own minute — the floor moves the frame, not the talk', () => {
		// 09:05 rounds to the 09:00 line (the axis is quarter hours); the label
		// above it now reads 09:00 instead of 09:05, and the tooltip still says
		// what the talk actually is.
		expect(html([session('a', 'A year of Gemini', '09:05', '09:20')])).toContain('09:05 – 09:20');
	});
});
