import { describe, expect, it } from 'vitest';
import {
	isCriterionKind,
	optionsToText,
	parseCriterion,
	parseOptionsText
} from './scorecard-criterion';

describe('parseOptionsText', () => {
	it('splits on newlines and commas, drops blanks and duplicates', () => {
		expect(parseOptionsText('Yes\nNo\nyes, Maybe\n')).toEqual(['Yes', 'No', 'Maybe']);
	});

	it('round-trips through optionsToText', () => {
		const options = ['Strong yes', 'Maybe', 'No'];
		expect(parseOptionsText(optionsToText(options))).toEqual(options);
	});
});

describe('isCriterionKind', () => {
	it('accepts the three stored kinds only', () => {
		expect(isCriterionKind('rating')).toBe(true);
		expect(isCriterionKind('select')).toBe(true);
		expect(isCriterionKind('text')).toBe(true);
		expect(isCriterionKind('number')).toBe(false);
	});
});

describe('parseCriterion', () => {
	it('keeps scaleMax only for rating and options only for select', () => {
		const rating = parseCriterion({
			label: 'Relevance',
			kind: 'rating',
			scaleMax: 5,
			optionsText: 'ignored',
			weight: 2
		});
		expect(rating.ok).toBe(true);
		if (!rating.ok) return;
		expect(rating.values).toMatchObject({
			kind: 'rating',
			scaleMax: 5,
			options: null,
			weight: '2.00'
		});

		const select = parseCriterion({
			label: 'Fit',
			kind: 'select',
			scaleMax: 5,
			optionsText: 'A\nB',
			weight: 1
		});
		expect(select.ok).toBe(true);
		if (!select.ok) return;
		expect(select.values.scaleMax).toBeNull();
		expect(select.values.options).toBe(JSON.stringify(['A', 'B']));

		const text = parseCriterion({
			label: 'Notes',
			kind: 'text',
			scaleMax: 5,
			optionsText: 'A\nB',
			weight: 1
		});
		expect(text.ok).toBe(true);
		if (!text.ok) return;
		expect(text.values.scaleMax).toBeNull();
		expect(text.values.options).toBeNull();
	});

	it('refuses a select with fewer than two options', () => {
		const result = parseCriterion({
			label: 'Fit',
			kind: 'select',
			scaleMax: null,
			optionsText: 'Only one',
			weight: 1
		});
		expect(result.ok).toBe(false);
	});

	it('refuses a non-positive weight', () => {
		const result = parseCriterion({
			label: 'Relevance',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 0
		});
		expect(result.ok).toBe(false);
	});
});
