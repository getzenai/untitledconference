/**
 * What withdrawing a submitted proposal costs, in sentences the dialog can
 * print without a modal (#663).
 *
 * Unlike the participation-task warning, this cannot be taken back: there is
 * no un-withdraw. The words live here so a test can read them.
 */

export type ProposalWithdrawWarning = {
	title: string;
	consequence: string;
	reversal: string;
};

export function proposalWithdrawWarning(conferenceName: string): ProposalWithdrawWarning {
	return {
		title: `Withdraw this proposal from ${conferenceName}?`,
		consequence:
			'The organizers will drop it from the review and decision lists. There is no undo.',
		reversal: 'If you change your mind you will need to submit again, as a new proposal.'
	};
}
