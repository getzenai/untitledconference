/**
 * The room columns of the public agenda grid.
 *
 * Narrow on purpose: it pins the one thing that went wrong on the World's Fair
 * site, where 31 rooms shared the screen width and left about 1.4rem each with
 * no way to scroll to any of them. A floor per column is the fix, and the two
 * grids sharing one definition is what keeps the room names over their columns.
 */
import type { PublicConference } from '$lib/conference/public-types';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = (roomCount: number, extra: Partial<PublicConference> = {}) => {
	const rooms = Array.from({ length: roomCount }, (_, i) => ({
		id: `room-${i + 1}`,
		name: `Hall ${i + 1}`
	}));

	return {
		id: 'conf-1',
		slug: 'many-rooms',
		name: 'Many Rooms Conf',
		venue: 'The Building',
		startsOn: '2027-06-01',
		endsOn: '2027-06-01',
		days: [{ id: 'day-1', date: '2027-06-01', label: 'Day 1' }],
		rooms,
		tracks: [],
		formats: [],
		sessions: [
			{
				id: 'session-1',
				title: 'Opening keynote',
				description: 'Everyone is in the same place for this one.',
				dayId: 'day-1',
				startsAt: '2027-06-01T09:00:00.000Z',
				endsAt: '2027-06-01T09:30:00.000Z',
				roomId: null,
				trackId: null,
				formatId: null,
				speakerIds: [],
				recordingUrl: null
			},
			{
				id: 'session-2',
				title: 'A talk in the last room',
				description: 'Only reachable by scrolling once the rooms outgrow the screen.',
				dayId: 'day-1',
				startsAt: '2027-06-01T10:00:00.000Z',
				endsAt: '2027-06-01T10:45:00.000Z',
				roomId: rooms[rooms.length - 1].id,
				trackId: null,
				formatId: null,
				speakerIds: [],
				recordingUrl: null
			}
		],
		speakers: [],
		...extra
	} satisfies PublicConference;
};

// `data` on a page also carries the layout's half — session, analytics, the open
// call — and the grid reads none of it. The cast keeps the fixture to what the
// component actually touches instead of a page of unused nulls.
const agenda = (roomCount: number) =>
	render(Page, { props: { data: { conference: conference(roomCount), embed: false } as never } })
		.body;

/** Every `grid-template-columns` the page rendered, in document order. */
const columnDefinitions = (html: string) =>
	[...html.matchAll(/grid-template-columns:\s*([^;"]+)/g)].map((m) => m[1].trim());

describe('the public agenda grid', () => {
	it('gives every room column a floor, so 31 rooms scroll instead of collapsing', () => {
		const definitions = columnDefinitions(agenda(31));

		// Two grids — the heading row and the body — and they must agree exactly,
		// or the room names stop standing over their own columns.
		expect(definitions).toHaveLength(2);
		expect(definitions[0]).toBe(definitions[1]);
		expect(definitions[0]).toContain('repeat(31, minmax(9rem, 1fr))');
	});

	it('keeps the same floor at two rooms, where 1fr is what does the work', () => {
		// The floor must not become the width: with two rooms the columns still
		// share the whole page, because 9rem is a minimum and 1fr the actual size.
		const definitions = columnDefinitions(agenda(2));

		expect(definitions[0]).toBe('4.5rem repeat(2, minmax(9rem, 1fr))');
		expect(definitions[1]).toContain('4.5rem repeat(2, minmax(9rem, 1fr))');
	});

	it('leaves the grid inside a horizontal scroll container', () => {
		// A floor without a scroller is a grid that overflows with no way to reach
		// the right-hand rooms, which is the same failure wearing different clothes.
		expect(agenda(31)).toContain('overflow-x-auto');
	});

	it('still spans a room-less session across every column', () => {
		// The plenary path is the one a column change is most likely to break:
		// no roomId means "all rooms", expressed as a column span, not a room index.
		const html = agenda(31);

		expect(html).toContain('grid-column: 2 / 33');
		expect(html).toContain('Opening keynote');
	});
});
