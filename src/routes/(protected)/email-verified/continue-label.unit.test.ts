import { describe, expect, it } from 'vitest';
import { emailVerifiedContinueLabel } from './continue-label';

describe('emailVerifiedContinueLabel', () => {
	it('says Dashboard only when the destination is home', () => {
		expect(emailVerifiedContinueLabel('/home')).toBe('Continue to Dashboard');
		expect(emailVerifiedContinueLabel('/home?tab=inbox')).toBe('Continue to Dashboard');
	});

	it('names the proposal when returnTo is the CFP the person left', () => {
		expect(emailVerifiedContinueLabel('/c/devflow-conf-2027/cfp')).toBe(
			'Continue to your proposal'
		);
		expect(emailVerifiedContinueLabel('/c/devflow-conf-2027/cfp?draft=1')).toBe(
			'Continue to your proposal'
		);
	});

	it('does not claim Dashboard for any other destination', () => {
		expect(emailVerifiedContinueLabel('/portal')).toBe('Continue');
		expect(emailVerifiedContinueLabel('/review/devflow')).toBe('Continue');
		expect(emailVerifiedContinueLabel('/c/devflow-conf-2027')).toBe('Continue');
		expect(emailVerifiedContinueLabel('/c/devflow-conf-2027/cfp/extra')).toBe('Continue');
	});

	it('keeps the skip-button verb when the destination is named', () => {
		expect(emailVerifiedContinueLabel('/home', 'Go')).toBe('Go to Dashboard');
		expect(emailVerifiedContinueLabel('/c/devflow-conf-2027/cfp', 'Go')).toBe(
			'Go to your proposal'
		);
		expect(emailVerifiedContinueLabel('/portal', 'Go')).toBe('Continue');
	});
});
