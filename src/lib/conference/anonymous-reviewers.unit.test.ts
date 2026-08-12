/**
 * What an anonymised reviewer is called.
 *
 * The label used to be the review's primary key — "Reviewer 286" next to real
 * names, which reads as a rendering fault rather than as deliberate anonymity.
 */
import { describe, expect, it } from 'vitest';
import { anonymousReviewerLabels, peerDisplayLabels } from './anonymous-reviewers';

describe('labelling anonymised reviewers', () => {
	it('numbers them from one within the submission, not by row id', () => {
		const labels = anonymousReviewerLabels([
			{ id: 286, anonymized: true },
			{ id: 41, anonymized: true }
		]);

		// The point of the change: nothing on the page is a database id.
		expect([...labels.values()]).toEqual(['Reviewer 1', 'Reviewer 2']);
		expect(labels.get(41)).toBe('Reviewer 1');
		expect(labels.get(286)).toBe('Reviewer 2');
	});

	it('leaves named reviewers out, so their own name survives', () => {
		const labels = anonymousReviewerLabels([
			{ id: 1, anonymized: false },
			{ id: 2, anonymized: true }
		]);

		expect(labels.has(1)).toBe(false);
		// Numbering counts only the hidden ones — "Reviewer 2" beside one hidden
		// reviewer would imply a second that nobody can find.
		expect(labels.get(2)).toBe('Reviewer 1');
	});

	it('is stable across reads, because an organizer refers to them out loud', () => {
		const reviews = [
			{ id: 9, anonymized: true },
			{ id: 3, anonymized: true },
			{ id: 7, anonymized: true }
		];

		const first = anonymousReviewerLabels(reviews);
		const shuffled = anonymousReviewerLabels([reviews[2], reviews[0], reviews[1]]);

		expect([...shuffled.entries()].sort()).toEqual([...first.entries()].sort());
		expect(first.get(3)).toBe('Reviewer 1');
	});

	it('has nothing to say about a submission nobody hid', () => {
		expect(anonymousReviewerLabels([{ id: 1, anonymized: false }]).size).toBe(0);
		expect(anonymousReviewerLabels([]).size).toBe(0);
	});
});

describe('peerDisplayLabels', () => {
	it('numbers every peer, not only anonymised ones', () => {
		const labels = peerDisplayLabels([{ id: 10 }, { id: 3 }, { id: 10 }]);
		expect([...labels.entries()]).toEqual([
			[3, 'Reviewer 1'],
			[10, 'Reviewer 2']
		]);
	});

	it('is stable under shuffle', () => {
		const a = peerDisplayLabels([{ id: 5 }, { id: 2 }, { id: 9 }]);
		const b = peerDisplayLabels([{ id: 9 }, { id: 5 }, { id: 2 }]);
		expect(a.get(2)).toBe('Reviewer 1');
		expect(b.get(2)).toBe('Reviewer 1');
		expect(a.get(9)).toBe('Reviewer 3');
		expect(b.get(9)).toBe('Reviewer 3');
	});
});
