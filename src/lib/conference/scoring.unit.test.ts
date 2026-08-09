import { describe, expect, it } from 'vitest';
import { formatScore, reviewScore, submissionScore } from './scoring';

const rating = (value: number | null, weight = 1, scaleMax: number | null = 5) => ({
	value,
	weight,
	scaleMax
});

describe('reviewScore', () => {
	it('is the plain mean when every criterion weighs the same', () => {
		expect(reviewScore({ submitted: true, scores: [rating(4), rating(5)] })).toBeCloseTo(0.9, 10);
	});

	it('lets the weighting move the result', () => {
		// Relevance 5 counts triple, depth 1 counts once: (5/5*3 + 1/5*1) / 4.
		const score = reviewScore({ submitted: true, scores: [rating(5, 3), rating(1, 1)] });
		expect(score).toBeCloseTo((1 * 3 + 0.2 * 1) / 4, 10);
	});

	it('normalises different scales before averaging', () => {
		// 4 out of 5 and 8 out of 10 are the same verdict and must not pull apart.
		const score = reviewScore({ submitted: true, scores: [rating(4), rating(8, 1, 10)] });
		expect(score).toBeCloseTo(0.8, 10);
	});

	it('skips blanks instead of reading them as zero', () => {
		expect(reviewScore({ submitted: true, scores: [rating(4), rating(null)] })).toBeCloseTo(
			0.8,
			10
		);
	});

	it('returns null when nothing is scorable', () => {
		expect(reviewScore({ submitted: true, scores: [rating(null), rating(3, 1, null)] })).toBeNull();
		expect(reviewScore({ submitted: true, scores: [] })).toBeNull();
	});
});

describe('submissionScore', () => {
	it('averages the reviewers on the 1..5 scale', () => {
		const score = submissionScore([
			{ submitted: true, scores: [rating(5)] },
			{ submitted: true, scores: [rating(4)] }
		]);
		expect(score).toBeCloseTo(4.5, 10);
	});

	it('ignores reviews that were assigned but never submitted', () => {
		const score = submissionScore([
			{ submitted: true, scores: [rating(5)] },
			{ submitted: false, scores: [rating(1)] }
		]);
		expect(score).toBeCloseTo(5, 10);
	});

	it('is null when nobody has scored it — not zero', () => {
		expect(submissionScore([{ submitted: false, scores: [rating(5)] }])).toBeNull();
		expect(submissionScore([])).toBeNull();
	});

	it('weights reviewers equally even when they filled in different numbers of criteria', () => {
		const thorough = { submitted: true, scores: [rating(5), rating(5), rating(5)] };
		const brief = { submitted: true, scores: [rating(1)] };
		expect(submissionScore([thorough, brief])).toBeCloseTo(3, 10);
	});
});

describe('formatScore', () => {
	it('shows one decimal, and an em dash for nothing', () => {
		expect(formatScore(4.25)).toBe('4.3');
		expect(formatScore(null)).toBe('—');
	});
});
