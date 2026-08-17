import { describe, expect, it } from 'vitest';
import {
	reviewAssignmentIsOpen,
	summarizeReviewAssignments,
	type ReviewAssignmentRow
} from './review-assignment-summary';

function row(
	title: string,
	overrides: Partial<ReviewAssignmentRow> & { title?: string } = {}
): ReviewAssignmentRow & { title: string } {
	return {
		title,
		ownReviewSubmitted: false,
		withdrawn: false,
		window: 'open',
		...overrides
	};
}

describe('summarizeReviewAssignments', () => {
	// The live miss on d12fdbb7: Inés had 19 of 27 reviewed, 8 she could
	// file tonight. Guus said 9 waiting and named a talk already at 4/4.
	it('does not count an already-reviewed row as open — the #888 case', () => {
		const alreadyReviewed = row('Documentation is a navigation problem', {
			ownReviewSubmitted: true
		});
		const filed = Array.from({ length: 18 }, (_, i) =>
			row(`Already filed ${i + 1}`, { ownReviewSubmitted: true })
		);
		const waiting = Array.from({ length: 8 }, (_, i) => row(`Still open ${i + 1}`));
		const summary = summarizeReviewAssignments([...filed, alreadyReviewed, ...waiting]);

		expect(summary.total).toBe(27);
		expect(summary.count).toBe(27);
		expect(summary.open).toBe(8);
		expect(summary.assignments.find((item) => item.title === alreadyReviewed.title)).toMatchObject({
			ownReviewSubmitted: true,
			open: false
		});
		expect(summary.assignments.filter((item) => item.open)).toHaveLength(8);
		expect(reviewAssignmentIsOpen(alreadyReviewed)).toBe(false);
	});

	it('keeps withdrawn talks out of the denominator, same as the queue screen', () => {
		const summary = summarizeReviewAssignments([
			row('Open tonight'),
			row('Filed', { ownReviewSubmitted: true }),
			row('Speaker took it back', { withdrawn: true })
		]);

		expect(summary.total).toBe(2);
		expect(summary.open).toBe(1);
		expect(summary.assignments.find((item) => item.withdrawn)?.open).toBe(false);
	});

	it('does not treat a closed or unopened window as open', () => {
		const summary = summarizeReviewAssignments([
			row('File tonight'),
			row('Opens next week', { window: 'not_yet_open' }),
			row('Round closed', { window: 'closed' })
		]);

		expect(summary.total).toBe(3);
		expect(summary.open).toBe(1);
		expect(summary.assignments.map((item) => item.open)).toEqual([true, false, false]);
	});
});
