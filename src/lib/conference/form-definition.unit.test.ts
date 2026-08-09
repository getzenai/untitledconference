/**
 * These rules decide what a submitter is shown and what they are allowed to send.
 * The cases below are the ones where a form silently becomes unfillable — a required
 * field nobody can see, a chained condition, a rule pointing at a deleted field.
 */
import { describe, expect, it } from 'vitest';
import {
	isVisible,
	optionsFromText,
	parseOptions,
	validateAnswers,
	validateDefinition,
	visibleFields,
	type AnswerContext,
	type FieldDefinition
} from './form-definition';

const field = (over: Partial<FieldDefinition> & { id: number }): FieldDefinition => ({
	label: `Field ${over.id}`,
	kind: 'short_text',
	required: false,
	position: over.id,
	options: null,
	conditionSource: null,
	conditionFieldId: null,
	conditionValue: null,
	...over
});

const ctx = (over: Partial<AnswerContext> = {}): AnswerContext => ({
	sessionFormatId: null,
	trackId: null,
	answers: {},
	...over
});

describe('parseOptions', () => {
	it('reads the stored JSON, an array, and survives nonsense', () => {
		expect(parseOptions('["A","B"]')).toEqual(['A', 'B']);
		expect(parseOptions(['A', 'B'])).toEqual(['A', 'B']);
		expect(parseOptions(null)).toEqual([]);
		// Broken options render an empty dropdown; throwing would take the page down.
		expect(parseOptions('not json')).toEqual([]);
		expect(parseOptions('{"a":1}')).toEqual([]);
	});

	it('takes one option per line from the builder', () => {
		expect(optionsFromText(' Beginner \n\nAdvanced\n')).toEqual(['Beginner', 'Advanced']);
	});
});

describe('conditional visibility (CFP-02)', () => {
	it('shows a field only for the configured session format', () => {
		const workshop = field({ id: 1, conditionSource: 'session_format', conditionValue: '7' });

		expect(isVisible(workshop, ctx({ sessionFormatId: 7 }))).toBe(true);
		expect(isVisible(workshop, ctx({ sessionFormatId: 8 }))).toBe(false);
		expect(isVisible(workshop, ctx())).toBe(false);
	});

	it('does the same for a track', () => {
		const f = field({ id: 1, conditionSource: 'track', conditionValue: '3' });

		expect(isVisible(f, ctx({ trackId: 3 }))).toBe(true);
		expect(isVisible(f, ctx({ trackId: 4 }))).toBe(false);
	});

	it('follows another answer, and hides the child when the parent is hidden', () => {
		const parent = field({
			id: 1,
			kind: 'select',
			conditionSource: 'session_format',
			conditionValue: '7'
		});
		const child = field({
			id: 2,
			conditionSource: 'field',
			conditionFieldId: 1,
			conditionValue: 'yes'
		});
		const all = [parent, child];

		// Parent visible and answered as the rule wants.
		expect(isVisible(child, ctx({ sessionFormatId: 7, answers: { 1: 'yes' } }), all)).toBe(true);
		// Right answer, but the parent is not on screen — so the answer cannot have been given.
		expect(isVisible(child, ctx({ sessionFormatId: 8, answers: { 1: 'yes' } }), all)).toBe(false);
		expect(isVisible(child, ctx({ sessionFormatId: 7, answers: { 1: 'no' } }), all)).toBe(false);
	});

	it('shows the field when its rule points at a field that no longer exists', () => {
		const orphan = field({
			id: 2,
			conditionSource: 'field',
			conditionFieldId: 99,
			conditionValue: 'x'
		});

		expect(isVisible(orphan, ctx(), [orphan])).toBe(true);
	});

	it('renders a cycle as hidden instead of hanging', () => {
		const a = field({ id: 1, conditionSource: 'field', conditionFieldId: 2, conditionValue: 'x' });
		const b = field({ id: 2, conditionSource: 'field', conditionFieldId: 1, conditionValue: 'x' });

		expect(isVisible(a, ctx({ answers: { 1: 'x', 2: 'x' } }), [a, b])).toBe(false);
	});

	it('orders by position, with the id as the tiebreaker', () => {
		const fields = [
			field({ id: 3, position: 0 }),
			field({ id: 2, position: 0 }),
			field({ id: 1, position: 5 })
		];

		expect(visibleFields(fields, ctx()).map((f) => f.id)).toEqual([2, 3, 1]);
	});
});

describe('answer validation (CFP-01)', () => {
	it('enforces required fields', () => {
		const fields = [field({ id: 1, label: 'Abstract', required: true })];

		expect(validateAnswers(fields, ctx({ answers: { 1: '   ' } }))).toEqual({
			1: 'Abstract is required.'
		});
		expect(validateAnswers(fields, ctx({ answers: { 1: 'Here it is' } }))).toEqual({});
	});

	it('never requires a field the submitter cannot see', () => {
		// The bug this exists to prevent: a submission blocked by an error next to a
		// field that is not on the page.
		const hidden = field({
			id: 1,
			required: true,
			conditionSource: 'session_format',
			conditionValue: '7'
		});

		expect(validateAnswers([hidden], ctx({ sessionFormatId: 8 }))).toEqual({});
		expect(validateAnswers([hidden], ctx({ sessionFormatId: 7 }))).toHaveProperty('1');
	});

	it('refuses a dropdown value that was never offered', () => {
		const fields = [field({ id: 1, label: 'Level', kind: 'select', options: '["Beginner"]' })];

		expect(validateAnswers(fields, ctx({ answers: { 1: 'Expert' } }))).toHaveProperty('1');
		expect(validateAnswers(fields, ctx({ answers: { 1: 'Beginner' } }))).toEqual({});
	});

	it('accepts only yes or no for a boolean', () => {
		const fields = [field({ id: 1, label: 'Given before?', kind: 'boolean' })];

		expect(validateAnswers(fields, ctx({ answers: { 1: 'maybe' } }))).toHaveProperty('1');
		expect(validateAnswers(fields, ctx({ answers: { 1: 'false' } }))).toEqual({});
	});
});

describe('definition validation (the builder)', () => {
	it('stops the states a submitter could not fill in', () => {
		expect(
			validateDefinition({
				label: ' ',
				kind: 'short_text',
				options: null,
				conditionSource: null,
				conditionValue: null
			})
		).toMatch(/label/);
		expect(
			validateDefinition({
				label: 'Level',
				kind: 'select',
				options: '[]',
				conditionSource: null,
				conditionValue: null
			})
		).toMatch(/option/);
		expect(
			validateDefinition({
				label: 'Extra',
				kind: 'short_text',
				options: null,
				conditionSource: 'track',
				conditionValue: ''
			})
		).toMatch(/value/);
		expect(
			validateDefinition({
				label: 'Level',
				kind: 'select',
				options: '["A"]',
				conditionSource: 'track',
				conditionValue: '2'
			})
		).toBeNull();
	});
});
