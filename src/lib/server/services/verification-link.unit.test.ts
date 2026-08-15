import { describe, expect, it } from 'vitest';
import { captureVerificationLink, takeVerificationLink } from './verification-link';

describe('verification link test handoff', () => {
	it('hands a freshly generated link to the test endpoint once', () => {
		captureVerificationLink('Ada@Example.test', 'https://example.test/verify-email?token=one');
		expect(takeVerificationLink('ada@example.test')).toContain('token=one');
		expect(takeVerificationLink('ada@example.test')).toBeNull();
	});

	it('forgets stale links', () => {
		captureVerificationLink('slow@example.test', 'https://example.test/verify-email?token=old', 0);
		expect(takeVerificationLink('slow@example.test', 30_001)).toBeNull();
	});
});
