/** The sentences a speaker reads before withdrawing a proposal (#663). */
import { describe, expect, it } from 'vitest';
import { proposalWithdrawWarning } from './proposal-withdraw-warning';

describe('proposalWithdrawWarning', () => {
	it('names the conference in the question', () => {
		expect(proposalWithdrawWarning('DevFlow Conf 2027').title).toBe(
			'Withdraw this proposal from DevFlow Conf 2027?'
		);
	});

	it('says the talk leaves the organizers’ lists, and that there is no undo', () => {
		const warning = proposalWithdrawWarning('DevFlow Conf 2027');
		expect(warning.consequence).toContain('review and decision lists');
		expect(warning.consequence).toContain('no undo');
		expect(warning.reversal).toContain('submit again');
	});
});
