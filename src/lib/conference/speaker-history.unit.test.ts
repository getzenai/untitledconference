/**
 * The sentence the committee hears (#451).
 *
 * Worth its own test because every one of these cases is a different reading in
 * the room: "first time with us" and "spoke here once" are opposite arguments,
 * and a missing year must not swallow the count.
 */
import { describe, expect, it } from 'vitest';
import { speakerHistorySummary, type SpeakerHistory } from './speaker-history';

function entry(years: (number | null)[]): SpeakerHistory {
	return {
		speakerProfileId: 1,
		name: 'Ada Lovelace',
		appearances: years.map((year, i) => ({
			conferenceId: i + 1,
			conferenceName: `Edition ${i + 1}`,
			year,
			talkTitle: `Talk ${i + 1}`
		}))
	};
}

describe('speakerHistorySummary', () => {
	it('names a first-timer rather than saying nothing', () => {
		expect(speakerHistorySummary(entry([]))).toBe('First time with us');
	});

	it('counts in words up to two and in figures after', () => {
		expect(speakerHistorySummary(entry([2025]))).toBe('Spoke here once, most recently 2025');
		expect(speakerHistorySummary(entry([2025, 2024]))).toBe('Spoke here twice, most recently 2025');
		expect(speakerHistorySummary(entry([2025, 2024, 2023]))).toBe(
			'Spoke here 3 times, most recently 2025'
		);
	});

	it('takes the most recent year from the head of the list, not the maximum', () => {
		// The query orders newest first. Trusting that order rather than re-deriving
		// it keeps one definition of "most recently" in the product.
		expect(speakerHistorySummary(entry([2025, 2024]))).toContain('2025');
	});

	it('skips past appearances whose edition has no date', () => {
		expect(speakerHistorySummary(entry([null, 2024]))).toBe('Spoke here twice, most recently 2024');
	});

	it('keeps the count when no appearance has a year at all', () => {
		// The weaker fact missing must not hide the stronger one: "they have been
		// here twice" still wins arguments without a year on it.
		expect(speakerHistorySummary(entry([null, null]))).toBe('Spoke here twice');
	});
});
