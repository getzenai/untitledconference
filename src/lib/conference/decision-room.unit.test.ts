import { describe, expect, it } from 'vitest';
import { latestPerKey, parseCapacity, slotCount, slotSentence } from './decision-room';

const line = (capacity: number | null, accepted: number) => ({
	id: null,
	name: 'Programme',
	capacity,
	accepted
});

describe('slotCount', () => {
	it('counts down from the capacity the organizer typed', () => {
		const count = slotCount(line(51, 33));

		expect(count.remaining).toBe(18);
		expect(count.over).toBe(0);
		expect(count.fraction).toBeCloseTo(33 / 51);
	});

	it('says nothing about a remainder when nobody has said how many slots there are', () => {
		const count = slotCount(line(null, 33));

		// Not zero, and not "full": we do not know their programme.
		expect(count.remaining).toBeNull();
		expect(count.fraction).toBeNull();
		expect(count.over).toBe(0);
	});

	it('names the overbooking rather than clamping the count', () => {
		const count = slotCount(line(10, 13));

		expect(count.remaining).toBe(-3);
		expect(count.over).toBe(3);
		// The meter fills; the number next to it carries the bad news.
		expect(count.fraction).toBe(1);
	});

	it('treats a capacity of zero as unsaid rather than dividing by it', () => {
		const count = slotCount(line(0, 0));

		expect(count.remaining).toBeNull();
		expect(count.fraction).toBeNull();
	});
});

describe('slotSentence', () => {
	it('puts the remainder in the sentence, because that is what is being asked', () => {
		expect(slotSentence(slotCount(line(51, 33)))).toBe('33 accepted, 18 left of 51');
	});

	it('drops the remainder when there is no capacity', () => {
		expect(slotSentence(slotCount(line(null, 7)))).toBe('7 accepted');
	});

	it('says none left rather than 0 left', () => {
		expect(slotSentence(slotCount(line(12, 12)))).toBe('12 accepted, none left of 12');
	});

	it('says how far over the programme has gone', () => {
		expect(slotSentence(slotCount(line(10, 13)))).toBe('13 accepted, 3 over 10');
	});
});

describe('parseCapacity', () => {
	it('reads a whole number', () => {
		expect(parseCapacity('51')).toBe(51);
		expect(parseCapacity(' 51 ')).toBe(51);
		expect(parseCapacity('0')).toBe(0);
	});

	it('reads an empty field as "not said", so a number typed by accident is reversible', () => {
		expect(parseCapacity('')).toBeNull();
		expect(parseCapacity('   ')).toBeNull();
	});

	it('rejects rather than coerces — Number("") is 0, and 0 is a statement', () => {
		expect(parseCapacity('nine')).toBe('invalid');
		expect(parseCapacity('4.5')).toBe('invalid');
		expect(parseCapacity('-1')).toBe('invalid');
		expect(parseCapacity(null)).toBe('invalid');
	});
});

/**
 * #592: the queue is keyed by submission id, and a keyed `{#each}` over a duplicate
 * key is a hard render error — the organizer keeps looking at the page they came from.
 */
describe('latestPerKey', () => {
	const review = (submissionId: number, roundPosition: number, roundId: number, note: string) => ({
		submissionId,
		roundPosition,
		roundId,
		note
	});

	it('keeps one row per key when a talk was reviewed in two rounds', () => {
		const rows = [
			review(1, 0, 10, 'screening'),
			review(1, 1, 11, 'deep dive'),
			review(2, 0, 10, 'other talk')
		];

		expect(latestPerKey(rows, (row) => row.submissionId).map((row) => row.note)).toEqual([
			'deep dive',
			'other talk'
		]);
	});

	it('takes the later round, whichever order the rows arrive in', () => {
		const later = review(1, 1, 11, 'deep dive');
		const earlier = review(1, 0, 10, 'screening');

		expect(latestPerKey([later, earlier], (row) => row.submissionId)).toEqual([later]);
		expect(latestPerKey([earlier, later], (row) => row.submissionId)).toEqual([later]);
	});

	it('breaks a tie between two rounds at the same position by id', () => {
		const rows = [review(1, 0, 10, 'first'), review(1, 0, 12, 'second')];

		expect(latestPerKey(rows, (row) => row.submissionId)).toEqual([rows[1]]);
	});

	it('leaves a list that has no duplicates in its own order', () => {
		const rows = [review(3, 0, 10, 'c'), review(1, 0, 10, 'a'), review(2, 0, 10, 'b')];

		expect(latestPerKey(rows, (row) => row.submissionId)).toEqual(rows);
	});
});
