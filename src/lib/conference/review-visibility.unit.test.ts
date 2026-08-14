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

	/**
	 * #465: the queue opened on `coverage` — "what still needs somebody", which is
	 * the chair's question. A volunteer with a free evening asks what they can file
	 * tonight, and the answer has to come first.
	 */
	it('puts what can be filed tonight first, then what is waiting, then what is done', () => {
		const mine = [
			row({ title: 'Filed already', ownReviewSubmitted: true }),
			row({ title: 'Opens next week', window: { state: 'not_yet_open' } }),
			row({ title: 'Covered but open', reviewsSubmitted: 3, window: { state: 'open' } }),
			row({ title: 'Nobody has looked', reviewsSubmitted: 0, window: { state: 'open' } })
		];

		expect(sortQueue(mine, 'mine').map((r) => r.title)).toEqual([
			'Nobody has looked',
			'Covered but open',
			'Opens next week',
			'Filed already'
		]);
	});

	it('treats a row with no window as workable rather than hiding it at the bottom', () => {
		// A conference that never set round dates is the common case, not a shut one.
		const mine = [
			row({ title: 'Waiting', window: { state: 'not_yet_open' } }),
			row({ title: 'No dates set' })
		];

		expect(sortQueue(mine, 'mine').map((r) => r.title)).toEqual(['No dates set', 'Waiting']);
	});

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

	it('sorts alphabetically by title', () => {
		expect(sortQueue(rows, 'title').map((r) => r.title)).toEqual([
			'Alpha',
			'Beta',
			'Delta',
			'Gamma'
		]);
	});

	it('sorts by track then title, with missing track last', () => {
		const withTracks = [
			row({ title: 'Zulu', track: 'Platform', reviewsSubmitted: 1, score: 1 }),
			row({ title: 'Alpha', track: 'AI', reviewsSubmitted: 1, score: 1 }),
			row({ title: 'Beta', track: 'AI', reviewsSubmitted: 1, score: 1 }),
			row({ title: 'No track yet', track: null, reviewsSubmitted: 1, score: 1 })
		];
		expect(sortQueue(withTracks, 'track').map((r) => r.title)).toEqual([
			'Alpha',
			'Beta',
			'Zulu',
			'No track yet'
		]);
	});

	it('does not mutate the list it was given', () => {
		const original = [...rows];
		sortQueue(rows, 'score');
		expect(rows).toEqual(original);
	});
});
