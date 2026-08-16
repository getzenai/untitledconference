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

/** `Number(value) || null` treats `0` as empty; ids are integers. */
export function parseOptionalId(value: string): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : null;
}

/** Empty stays an option so a picked format or track can be cleared. */
export const NONE_SELECT_OPTION = { value: '', label: '—' };

export const YES_NO_OPTIONS = [
	NONE_SELECT_OPTION,
	{ value: 'true', label: 'Yes' },
	{ value: 'false', label: 'No' }
];

export function formatSelectOptions(
	formats: { id: number; name: string; minutes: number | null }[]
): { value: string; label: string }[] {
	return [
		NONE_SELECT_OPTION,
		...formats.map((format) => ({
			value: String(format.id),
			label: format.minutes ? `${format.name} (${format.minutes} min)` : format.name
		}))
	];
}

export function trackSelectOptions(
	tracks: { id: number; name: string }[]
): { value: string; label: string }[] {
	return [
		NONE_SELECT_OPTION,
		...tracks.map((track) => ({ value: String(track.id), label: track.name }))
	];
}

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
