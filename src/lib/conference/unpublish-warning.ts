/**
 * What "Return to draft" actually costs, in the words the organizer needs *before*
 * the click rather than after it (#452).
 *
 * The button sits on the settings page; everything it breaks is somewhere else —
 * the public conference page and the public submission form both answer 404 the
 * moment the conference stops being published. An organizer looking at Settings
 * sees none of that happen.
 *
 * The sentence is here, not inline in the dialog, so it can be read in a test
 * without standing a modal up, and so the CFP clause cannot drift away from the
 * condition that produces it.
 */

export type UnpublishWarning = {
	/** The address that stops answering. */
	url: string;
	/** The consequence, one sentence. */
	consequence: string;
	/** Only when speakers can submit right now — otherwise nothing is interrupted. */
	inFlight: string | null;
};

export function unpublishWarning(slug: string, callOpen: boolean): UnpublishWarning {
	return {
		url: `/c/${slug}`,
		consequence:
			'The public conference page and the public submission form answer 404 until you publish again.',
		inFlight: callOpen
			? 'The call for papers is open right now: a speaker in the middle of a proposal cannot send it, and one following a link from your CFP will land on a 404.'
			: null
	};
}
