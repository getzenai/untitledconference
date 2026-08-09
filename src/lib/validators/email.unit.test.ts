import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from './disposable-email';
import { emailSchema, registrationEmailSchema } from './email';

describe('emailSchema', () => {
	it('normalizes case and surrounding whitespace', () => {
		expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
	});

	it('rejects malformed addresses', () => {
		expect(emailSchema.safeParse('not-an-email').success).toBe(false);
		expect(emailSchema.safeParse('').success).toBe(false);
	});

	it('accepts a throwaway address, so existing accounts can still sign in', () => {
		expect(emailSchema.safeParse('someone@mailinator.com').success).toBe(true);
	});
});

describe('registrationEmailSchema', () => {
	it('accepts a normal address', () => {
		expect(registrationEmailSchema.parse('ada@example.com')).toBe('ada@example.com');
	});

	it('rejects known throwaway providers', () => {
		expect(registrationEmailSchema.safeParse('someone@mailinator.com').success).toBe(false);
	});

	it('rejects throwaway providers regardless of casing', () => {
		expect(registrationEmailSchema.safeParse('Someone@MAILINATOR.com').success).toBe(false);
	});
});

describe('isDisposableEmail', () => {
	it('matches a known disposable domain', () => {
		expect(isDisposableEmail('a@mailinator.com')).toBe(true);
	});

	it('does not match a normal domain', () => {
		expect(isDisposableEmail('a@example.com')).toBe(false);
	});

	it('returns false for input without a domain', () => {
		expect(isDisposableEmail('no-at-sign')).toBe(false);
	});
});
