import { describe, expect, it } from 'vitest';
import { evaluatePasswordStrength, isPasswordStrongEnough } from './password-strength';
import { PASSWORD_MIN_SCORE, PASSWORD_STRENGTH_LABELS } from './password-strength-config';

describe('evaluatePasswordStrength', () => {
	it('scores an empty password as 0 without feedback', () => {
		expect(evaluatePasswordStrength('')).toEqual({ score: 0, warning: null, suggestions: [] });
	});

	it('scores well-known bad passwords at the bottom of the scale', () => {
		expect(evaluatePasswordStrength('password').score).toBe(0);
		expect(evaluatePasswordStrength('password123').score).toBe(0);
	});

	it('scores a long random passphrase at the top of the scale', () => {
		expect(evaluatePasswordStrength('correct horse battery staple').score).toBe(4);
	});

	it('returns a score within the 0..4 range for every input', () => {
		for (const candidate of ['a', 'aaaaaaaa', 'Tr0ub4dor&3', 'x7#Qv!p2Lm9@zR']) {
			const { score } = evaluatePasswordStrength(candidate);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(4);
		}
	});

	it('surfaces zxcvbn feedback for a weak password', () => {
		const { warning, suggestions } = evaluatePasswordStrength('qwerty');
		expect(typeof warning === 'string' || warning === null).toBe(true);
		expect(Array.isArray(suggestions)).toBe(true);
		expect(suggestions.length).toBeGreaterThan(0);
	});

	it('penalises passwords derived from the user’s own details', () => {
		const withoutContext = evaluatePasswordStrength('alicewonderland');
		const withContext = evaluatePasswordStrength('alicewonderland', [
			'alice@wonderland.example',
			'Alice Wonderland'
		]);
		expect(withContext.score).toBeLessThanOrEqual(withoutContext.score);
	});

	it('ignores empty user inputs instead of passing them to zxcvbn', () => {
		expect(() => evaluatePasswordStrength('some-password', ['', undefined as never])).not.toThrow();
	});

	it('has a label for every possible score', () => {
		expect(Object.keys(PASSWORD_STRENGTH_LABELS)).toEqual(['0', '1', '2', '3', '4']);
	});
});

describe('isPasswordStrongEnough', () => {
	it('rejects passwords below the default minimum score', () => {
		expect(isPasswordStrongEnough('password123')).toBe(false);
		expect(isPasswordStrongEnough('admin123')).toBe(false);
	});

	it('accepts passwords at or above the default minimum score', () => {
		expect(isPasswordStrongEnough('correct horse battery staple')).toBe(true);
		expect(isPasswordStrongEnough('JourneyTest123!')).toBe(true);
	});

	it('honours a custom minimum score', () => {
		const weak = 'admin123';
		expect(isPasswordStrongEnough(weak, 1)).toBe(true);
		expect(isPasswordStrongEnough(weak, 3)).toBe(false);
	});

	it('treats a minimum score of 0 as "check disabled"', () => {
		expect(isPasswordStrongEnough('', 0)).toBe(true);
		expect(isPasswordStrongEnough('password', 0)).toBe(true);
	});

	it('rejects the empty string under the default bar', () => {
		expect(isPasswordStrongEnough('')).toBe(false);
	});

	it('uses PASSWORD_MIN_SCORE as its default bar', () => {
		const candidate = 'admin123';
		expect(isPasswordStrongEnough(candidate)).toBe(
			isPasswordStrongEnough(candidate, PASSWORD_MIN_SCORE)
		);
	});
});
