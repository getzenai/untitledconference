/**
 * Who is speaking, on the public agenda card (#706).
 *
 * The name used to live only in the tooltip and the aria-label. A tooltip has
 * no hover target on a phone, so a visitor planning on one saw twelve talks
 * and no speakers. Height still belongs to duration (#588): only a `full`
 * card (45 minutes and up) has room for a second line, and that line is now
 * the speaker. Compact and tiny stay title-only; the name is on the session
 * page the tap already opens.
 *
 * These tests pin what each density puts *on the tile* — not that the name
 * occurs somewhere in the DOM, which the aria-label already made true.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const pageUrl = { current: new URL('https://example.test/c/who-speaks/agenda') };

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return pageUrl.current;
		}
	}
}));

const conference = (minutes: number, withSpeaker = true): PublicConference =>
	({
		id: 'conf-1',
		slug: 'who-speaks',
		name: 'Who Speaks',
		venue: 'The Building',
		startsOn: '2027-06-01',
		endsOn: '2027-06-01',
		days: [{ id: 'day-1', date: '2027-06-01', label: 'Day 1' }],
		rooms: [{ id: 'room-1', name: 'Main Stage' }],
		tracks: [{ id: 'track-1', name: 'Platform and Infra' }],
		formats: [{ id: 'format-1', name: 'Talk', minutes: 30 }],
		sessions: [
			{
				id: 'session-1',
				title: 'Containing agents',
				description: 'What the room is for.',
				dayId: 'day-1',
				startsAt: '2027-06-01T09:00:00.000Z',
				endsAt: new Date(Date.UTC(2027, 5, 1, 9, minutes)).toISOString(),
				roomId: 'room-1',
				trackId: 'track-1',
				formatId: 'format-1',
				speakerIds: withSpeaker ? ['spk-1'] : [],
				recordingUrl: null
			}
		],
		speakers: withSpeaker
			? [
					{
						id: 'spk-1',
						name: 'Ada Lovelace',
						sortName: 'Lovelace, Ada',
						jobTitle: null,
						company: null,
						headshotUrl: null,
						bio: null,
						links: []
					}
				]
			: []
	}) satisfies PublicConference;

const page = (minutes: number, withSpeaker = true) =>
	render(Page, {
		props: { data: { conference: conference(minutes, withSpeaker), embed: false } as never }
	}).body;

const card = (minutes: number, withSpeaker = true) => {
	const match = page(minutes, withSpeaker).match(/<button[^>]*grid-column[^>]*>[\s\S]*?<\/button>/);
	if (!match) throw new Error('no session card rendered');
	return match[0];
};

/** The tile itself — everything inside the button, not the aria-label. */
const tile = (html: string) => html.replace(/^<button[^>]*>/, '').replace(/<\/button>$/, '');

describe('public agenda card, what each density shows', () => {
	it('puts the speaker on a 45-minute card, not track · format', () => {
		const html = card(45);

		expect(html).toContain('data-density="full"');
		expect(tile(html)).toContain('Ada Lovelace');
		expect(tile(html)).not.toContain('Platform and Infra');
		expect(html).toMatch(/\bp-2\b/);
		expect(page(45)).toContain('repeat(3, 1.5rem)');
	});

	it('puts the speaker on a 60-minute card the same way', () => {
		const html = card(60);

		expect(html).toContain('data-density="full"');
		expect(tile(html)).toContain('Ada Lovelace');
		expect(tile(html)).not.toContain('Platform and Infra');
		expect(page(60)).toContain('repeat(4, 1.5rem)');
	});

	it('keeps track · format on a full card that has no speaker', () => {
		const html = card(45, false);

		expect(tile(html)).toContain('Platform and Infra');
		expect(tile(html)).not.toContain('Ada Lovelace');
	});

	it('keeps a 30-minute card at title only — the speaker is not on the tile', () => {
		const html = card(30);

		expect(html).toContain('data-density="compact"');
		expect(html).toMatch(/\bp-1\b/);
		expect(tile(html)).toContain('Containing agents');
		expect(tile(html)).not.toContain('Ada Lovelace');
		expect(tile(html)).not.toContain('Platform and Infra');
		// The name is still in the accessible name, just not painted on the tile.
		expect(html).toContain('Ada Lovelace');
		expect(page(30)).toContain('repeat(2, 1.5rem)');
	});

	it('keeps a 15-minute card at one small title line, no speaker, no extra padding', () => {
		const html = card(15);

		expect(html).toContain('data-density="tiny"');
		expect(html).toMatch(/\bpy-0\b/);
		expect(html).toContain('text-[11px]');
		expect(tile(html)).toContain('Containing agents');
		expect(tile(html)).not.toContain('Ada Lovelace');
		expect(page(15)).toContain('repeat(1, 1.5rem)');
	});
});

describe('public agenda card, the path that does not need a hover', () => {
	it('lists the speaker on the session page a tap opens', () => {
		pageUrl.current = new URL('https://example.test/c/who-speaks/agenda?session=session-1');

		const html = render(Page, {
			props: { data: { conference: conference(15), embed: false } as never }
		}).body;

		expect(html).toContain('Containing agents');
		expect(html).toContain('Ada Lovelace');
		expect(html).toContain('/c/who-speaks/speakers/spk-1');
		expect(html).not.toContain('data-density=');

		pageUrl.current = new URL('https://example.test/c/who-speaks/agenda');
	});
});
