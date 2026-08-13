/**
 * Short cards on the public agenda grid.
 *
 * Narrow on purpose: it pins the one thing Fabian saw on the public agenda,
 * where a 30-minute card showed "Four hundred engineers, one" and lost
 * "repository" mid-word. The card is two 1.5rem rows (47px), p-2 leaves 31px of
 * content box, and two lines of leading-tight text-sm need 35px — so the second
 * line was cut with no ellipsis, which reads as broken rather than shortened.
 *
 * The fix is padding and clamping, not a smaller font and not a taller grid, so
 * what these tests hold is: a 30-minute card pads by 4px and clamps its title,
 * and a longer card is left exactly as it was.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = (minutes: number) =>
	({
		id: 'conf-1',
		slug: 'short-cards',
		name: 'Short Cards Conf',
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
				title: 'Four hundred engineers, one repository',
				description: 'What actually breaks at that size.',
				dayId: 'day-1',
				startsAt: '2027-06-01T09:00:00.000Z',
				endsAt: new Date(Date.UTC(2027, 5, 1, 9, minutes)).toISOString(),
				roomId: 'room-1',
				trackId: 'track-1',
				formatId: 'format-1',
				speakerIds: ['spk-1'],
				recordingUrl: null
			}
		],
		speakers: [
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
	}) satisfies PublicConference;

const page = (minutes: number) =>
	render(Page, {
		props: { data: { conference: conference(minutes), embed: false } as never }
	}).body;

/** The rendered card, isolated from the rest of the page. */
const card = (minutes: number) => {
	const match = page(minutes).match(/<button[^>]*grid-column[^>]*>[\s\S]*?<\/button>/);
	if (!match) throw new Error('no session card rendered');
	return match[0];
};

describe('public agenda short cards', () => {
	it('pads a 30-minute card by 4px, because that is the whole deficit', () => {
		const html = card(30);

		// Class boundaries, not substrings: `line-clamp-2` ends in "p-2".
		expect(html).toMatch(/\bp-1\b/);
		expect(html).not.toMatch(/\bp-2\b/);
	});

	it('clamps the title of a 30-minute card so an overlong one ends in an ellipsis', () => {
		expect(card(30)).toContain('line-clamp-2');
	});

	it('drops the track and format line on a 30-minute card instead of clipping it invisibly', () => {
		// It never fit in 47px; the dialog behind the card still carries it.
		expect(card(30)).not.toContain('Platform and Infra');
	});

	it('keeps the full title, speaker and time in a shadcn tooltip, not title=', () => {
		const html = page(30);
		const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

		// Portal content is not in SSR. The trigger and the accessible name are;
		// the markup is what carries speaker and time into the tooltip.
		expect(html).toContain('data-slot="tooltip-trigger"');
		expect(html).toContain('Four hundred engineers, one repository');
		expect(html).toContain('Ada Lovelace');
		expect(html).toContain('09:00 – 09:30');
		expect(card(30)).not.toMatch(/\btitle="/);
		expect(html).toContain('repeat(2, 1.5rem)');
		expect(source).toContain('TooltipContent');
		expect(source).toContain('session.timeRange');
		expect(source).toContain('speakers');
	});

	it('leaves a 45-minute card at the normal padding, unclamped, with its meta line', () => {
		const html = card(45);

		expect(html).toMatch(/\bp-2\b/);
		expect(html).not.toMatch(/\bp-1\b/);
		expect(html).not.toContain('line-clamp-2');
		expect(html).toContain('Platform and Infra');
	});
});
