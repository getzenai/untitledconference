/**
 * Programme order, and a talk that has two speakers (#449).
 *
 * The export is only useful if it reads like the grid: day, then start, then
 * room. And the whole reason this exists is the co-presenter who appeared in
 * week six — a list that only prints the primary speaker is the list they
 * already re-type by hand.
 */
import { describe, expect, it } from 'vitest';
import { runOfShow, type ShowTalkInput } from './run-of-show';

const at = (iso: string) => new Date(iso);

function talk(partial: Partial<ShowTalkInput> & Pick<ShowTalkInput, 'title'>): ShowTalkInput {
	return {
		day: '2028-05-10',
		dayPosition: 0,
		room: 'Hall A',
		roomPosition: 0,
		startsAt: at('2028-05-10T09:00:00Z'),
		endsAt: at('2028-05-10T09:30:00Z'),
		abstract: null,
		speakers: [],
		file: null,
		...partial
	};
}

describe('run of show order', () => {
	it('sorts by day, then start, then room, and names both speakers of a talk', () => {
		const rows = runOfShow([
			talk({
				title: 'Keynote on day two',
				day: '2028-05-11',
				dayPosition: 1,
				startsAt: at('2028-05-11T09:00:00Z'),
				endsAt: at('2028-05-11T09:45:00Z'),
				speakers: [{ name: 'Solo Speaker', position: 0 }]
			}),
			talk({
				title: 'Same morning, later',
				startsAt: at('2028-05-10T11:00:00Z'),
				endsAt: at('2028-05-10T11:30:00Z')
			}),
			talk({
				title: 'Same slot, hall B',
				room: 'Hall B',
				roomPosition: 1,
				speakers: [{ name: 'Only B', position: 0 }]
			}),
			talk({
				title: 'Opening the grid',
				// Co-presenter first in the payload, so a pass-through would print
				// them first. Position is the truth, not arrival order.
				speakers: [
					{ name: 'Priya Shah', position: 1 },
					{ name: 'Ada Bennett', position: 0 }
				],
				abstract: 'How we ship without the wait.'
			})
		]);

		expect(rows.map((r) => r.title)).toEqual([
			'Opening the grid',
			'Same slot, hall B',
			'Same morning, later',
			'Keynote on day two'
		]);

		const opening = rows[0];
		expect(opening.speakers).toEqual(['Ada Bennett', 'Priya Shah']);
		expect(opening.abstract).toBe('How we ship without the wait.');
		expect(opening.room).toBe('Hall A');
		expect(opening.day).toBe('2028-05-10');
	});
});
