import { describe, expect, it } from 'vitest';
import { submissionsTrend, TREND_WINDOW } from './submissions-trend';

const series = (...counts: number[]) => counts.map((count) => ({ count }));
/** Thirteen days is one day short of two full windows — the honest-silence case. */
const thirteen = series(...Array<number>(TREND_WINDOW * 2 - 1).fill(1));

describe('submissions trend', () => {
	it('compares the last seven days against the seven before them', () => {
		// Older half sums to 7, newer half to 21.
		const trend = submissionsTrend(series(1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3));

		expect(trend).toEqual({ recent: 21, previous: 7, delta: 14, direction: 'up' });
	});

	it('reads a quieter week as down', () => {
		const trend = submissionsTrend(series(4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 1));

		expect(trend?.direction).toBe('down');
		expect(trend?.delta).toBe(-27);
	});

	it('calls two equal weeks flat rather than up', () => {
		expect(submissionsTrend(series(2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2))?.direction).toBe(
			'flat'
		);
	});

	it('says nothing until two full windows exist', () => {
		expect(submissionsTrend(thirteen)).toBeNull();
		expect(submissionsTrend([])).toBeNull();
	});

	/**
	 * A thirty-day series must be read from its end. Summing the first fourteen
	 * days would answer a question about last month with a straight face.
	 */
	it('ignores everything older than the two windows', () => {
		const older = series(...Array<number>(16).fill(9));
		const trend = submissionsTrend([...older, ...series(1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2)]);

		expect(trend).toEqual({ recent: 14, previous: 7, delta: 7, direction: 'up' });
	});
});
