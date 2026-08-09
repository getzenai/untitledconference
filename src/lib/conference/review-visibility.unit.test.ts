import { describe, expect, it } from 'vitest';
import { canSeePeerReviews, sortQueue, type QueueRow } from './review-visibility';

const row = (over: Partial<QueueRow> & { title: string }): QueueRow => ({
	submissionId: over.title.length,
	reviewsSubmitted: 0,
	score: null,
	ownReviewSubmitted: false,
	...over
});

describe('canSeePeerReviews', () => {
	it('opens everything in the open mode', () => {
		expect(canSeePeerReviews('open', false)).toBe(true);
		expect(canSeePeerReviews('open', true)).toBe(true);
	});

	it('holds peers back until this reviewer has SUBMITTED their own', () => {
		// Assigned or half-written is exactly the state the mode protects.
		expect(canSeePeerReviews('blind_until_reviewed', false)).toBe(false);
		expect(canSeePeerReviews('blind_until_reviewed', true)).toBe(true);
	});
});

describe('sortQueue', () => {
	const rows = [
		row({ title: 'Beta', reviewsSubmitted: 2, score: 4.1 }),
		row({ title: 'Alpha', reviewsSubmitted: 0, score: 2.0 }),
		row({ title: 'Gamma', reviewsSubmitted: 0, score: null }),
		row({ title: 'Delta', reviewsSubmitted: 2, score: 4.9 })
	];

	it('puts the least-reviewed first, then alphabetically', () => {
		expect(sortQueue(rows, 'coverage').map((r) => r.title)).toEqual([
			'Alpha',
			'Gamma',
			'Beta',
			'Delta'
		]);
	});

	it('sorts by score descending and sends the unscored to the end', () => {
		// A score the viewer may not see must not read as a bad score.
		expect(sortQueue(rows, 'score').map((r) => r.title)).toEqual([
			'Delta',
			'Beta',
			'Alpha',
			'Gamma'
		]);
	});

	it('does not mutate the list it was given', () => {
		const original = [...rows];
		sortQueue(rows, 'score');
		expect(rows).toEqual(original);
	});
});
