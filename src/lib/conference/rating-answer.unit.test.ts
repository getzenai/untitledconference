import { describe, expect, it } from 'vitest';
import { ratingAnswerError } from './rating-answer';

const relevance = { label: 'Relevance', scaleMax: 5 };

describe('ratingAnswerError', () => {
	it('accepts an unanswered criterion', () => {
		expect(ratingAnswerError('', relevance)).toBeNull();
		expect(ratingAnswerError('   ', relevance)).toBeNull();
	});

	it('accepts every number on the scale, zero included', () => {
		for (const value of ['0', '1', '3', '5']) {
			expect(ratingAnswerError(value, relevance)).toBeNull();
		}
	});

	it('names the criterion and the scale when the number is past the top', () => {
		expect(ratingAnswerError('7', relevance)).toBe(
			'Relevance is scored out of 5, so 7 is off the scale.'
		);
	});

	it('refuses a negative score', () => {
		expect(ratingAnswerError('-1', relevance)).toBe('Relevance does not go below 0.');
	});

	it('refuses something that is not a number', () => {
		expect(ratingAnswerError('good', relevance)).toBe('Relevance takes a number.');
	});

	it('lets any positive number stand when the criterion has no scale', () => {
		expect(ratingAnswerError('50', { label: 'Depth', scaleMax: null })).toBeNull();
	});
});
