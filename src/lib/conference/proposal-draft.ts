/**
 * The shape the proposal form is filled from.
 *
 * Its own module because three places need it and none of them should own it:
 * the form component renders it, the public call starts an empty one, and the
 * edit route builds one from a stored draft. Every field is a plain string —
 * that is what an input round-trips — so `null` never reaches a `value=`.
 */
export type ProposalDraft = {
	title: string;
	abstract: string;
	keyTakeaway: string;
	audienceLevel: string;
	sessionFormatId: number | null;
	trackId: number | null;
	answers: Record<number, string>;
	speaker: {
		name: string;
		sortName: string;
		email: string;
		jobTitle: string;
		company: string;
		bio: string;
	};
	coSpeakers: { name: string; email: string; roleLabel: string }[];
};

export function emptyProposal(): ProposalDraft {
	return {
		title: '',
		abstract: '',
		keyTakeaway: '',
		audienceLevel: '',
		sessionFormatId: null,
		trackId: null,
		answers: {},
		speaker: { name: '', sortName: '', email: '', jobTitle: '', company: '', bio: '' },
		coSpeakers: []
	};
}
