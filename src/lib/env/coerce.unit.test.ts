import { describe, expect, it } from 'vitest';
import {
	boolWithDefault,
	emptyToUndefined,
	lowerEnumWithDefault,
	optionalLowerEnum,
	optionalStr,
	requiredStr,
	strWithDefault
} from './coerce';

describe('emptyToUndefined', () => {
	it('maps blank strings to undefined and passes others through', () => {
		expect(emptyToUndefined('')).toBeUndefined();
		expect(emptyToUndefined('x')).toBe('x');
		expect(emptyToUndefined(undefined)).toBeUndefined();
	});
});

describe('optionalStr', () => {
	const s = optionalStr();
	it('treats unset and blank as undefined', () => {
		expect(s.parse(undefined)).toBeUndefined();
		expect(s.parse('')).toBeUndefined();
	});
	it('keeps real values', () => {
		expect(s.parse('hello')).toBe('hello');
	});
});

describe('strWithDefault', () => {
	const s = strWithDefault('fallback');
	it('applies the default when unset or blank', () => {
		expect(s.parse(undefined)).toBe('fallback');
		expect(s.parse('')).toBe('fallback');
	});
	it('keeps real values', () => {
		expect(s.parse('actual')).toBe('actual');
	});
});

describe('requiredStr', () => {
	const s = requiredStr('NEEDED is required');
	it('accepts a real value', () => {
		expect(s.parse('present')).toBe('present');
	});
	it('rejects unset and blank with the message', () => {
		expect(() => s.parse(undefined)).toThrow('NEEDED is required');
		expect(() => s.parse('')).toThrow('NEEDED is required');
	});
});

describe('boolWithDefault', () => {
	it('parses "true"/"1" as true, everything else as false', () => {
		const b = boolWithDefault(false);
		expect(b.parse('true')).toBe(true);
		expect(b.parse('1')).toBe(true);
		expect(b.parse('false')).toBe(false);
		expect(b.parse('no')).toBe(false);
	});
	it('is case-insensitive (a strict superset of `.toLowerCase() === "true"` call sites)', () => {
		const b = boolWithDefault(false);
		expect(b.parse('TRUE')).toBe(true);
		expect(b.parse('True')).toBe(true);
	});
	it('applies the default when unset or blank', () => {
		expect(boolWithDefault(false).parse(undefined)).toBe(false);
		expect(boolWithDefault(true).parse('')).toBe(true);
		expect(boolWithDefault(true).parse('false')).toBe(false);
	});
});

describe('lowerEnumWithDefault', () => {
	const e = lowerEnumWithDefault(['human', 'json'] as const, 'human');
	it('lower-cases input and matches the enum', () => {
		expect(e.parse('JSON')).toBe('json');
		expect(e.parse('Human')).toBe('human');
	});
	it('applies the default when unset', () => {
		expect(e.parse(undefined)).toBe('human');
	});
	it('rejects values outside the enum', () => {
		expect(() => e.parse('xml')).toThrow();
	});
});

describe('optionalLowerEnum', () => {
	const e = optionalLowerEnum(['azure', 'mock'] as const);
	it('stays undefined when unset or blank', () => {
		expect(e.parse(undefined)).toBeUndefined();
		expect(e.parse('')).toBeUndefined();
	});
	it('lower-cases and validates when set', () => {
		expect(e.parse('AZURE')).toBe('azure');
		expect(() => e.parse('openai')).toThrow();
	});
});
