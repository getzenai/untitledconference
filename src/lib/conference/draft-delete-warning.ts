/**
 * What deleting a CFP draft costs, in sentences the dialog can print (#742).
 *
 * A draft was never offered, so this is not a withdrawal: the row goes away.
 * The words live here so a test can read them.
 */

export type DraftDeleteWarning = {
	title: string;
	consequence: string;
	reversal: string;
};

export function draftDeleteWarning(who: 'author' | 'organizer'): DraftDeleteWarning {
	if (who === 'organizer') {
		return {
			title: 'Delete this draft?',
			consequence:
				'The speaker has not submitted it. It will disappear from their portal and from this list. There is no undo.',
			reversal: 'If they still want to propose it they will need to start again.'
		};
	}

	return {
		title: 'Delete this draft?',
		consequence:
			"It will be gone from your proposals and from the organizer's list. There is no undo.",
		reversal: 'If you change your mind you will need to start a new proposal.'
	};
}
