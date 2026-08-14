/**
 * What "I can't take part" actually costs, in this speaker's own numbers (#495).
 *
 * The button sits among ordinary task actions that cost nothing, and one click
 * used to withdraw the speaker from the whole event. The answer is stored per
 * conference, not per talk, so someone with two accepted talks is deciding about
 * both — "this withdraws you from two accepted talks" is a different decision
 * from "from this one".
 *
 * The sentences live here rather than inline in the dialog so they can be read in
 * a test without standing a modal up, the same reason `unpublish-warning.ts`
 * exists.
 */

export type WithdrawWarning = {
	/** The question in the dialog's title. */
	title: string;
	/** What the organizers will do about it, one sentence. */
	consequence: string;
	/** That it can be taken back, and what it still costs. */
	reversal: string;
};

export function withdrawWarning(conferenceName: string, acceptedTalks: number): WithdrawWarning {
	const scope =
		acceptedTalks > 1
			? `all ${acceptedTalks} of your accepted talks at ${conferenceName}`
			: `your accepted talk at ${conferenceName}`;

	return {
		title: `Tell ${conferenceName} you cannot take part?`,
		consequence: `The organizers will be told to drop ${scope} from the programme.`,
		reversal:
			'You can change your mind on this page afterwards — but the organizers may have filled your slot by then.'
	};
}
