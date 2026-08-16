import { describe, expect, it } from 'vitest';
import { reviewWriteBaseline, scoresFromCriteria } from './review-write-baseline';

describe('reviewWriteBaseline', () => {
	it('does not depend on the order the scores were written', () => {
		const comment = 'On time';
		const status = 'assigned';
		const left = reviewWriteBaseline({ status, comment, scores: { 3: '4', 1: '2' } });
		const right = reviewWriteBaseline({ status, comment, scores: { 1: '2', 3: '4' } });
		expect(left).toBe(right);
	});

	it('changes when the saved comment or a score moves', () => {
		const base = reviewWriteBaseline({
			status: 'assigned',
			comment: 'tab-a',
			scores: { 1: '4' }
		});
		expect(
			reviewWriteBaseline({ status: 'assigned', comment: 'tab-b', scores: { 1: '4' } })
		).not.toBe(base);
		expect(
			reviewWriteBaseline({ status: 'assigned', comment: 'tab-a', scores: { 1: '5' } })
		).not.toBe(base);
		expect(
			reviewWriteBaseline({ status: 'submitted', comment: 'tab-a', scores: { 1: '4' } })
		).not.toBe(base);
	});
});

describe('scoresFromCriteria', () => {
	it('turns a rating and a text box into the same shape the form posts', () => {
		expect(
			scoresFromCriteria([
				{ id: 3, kind: 'rating', value: 4, valueText: null },
				{ id: 7, kind: 'text', value: null, valueText: 'Tighten the abstract' }
			])
		).toEqual({ 3: '4', 7: 'Tighten the abstract' });
	});
});
