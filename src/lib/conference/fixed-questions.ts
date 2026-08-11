/**
 * The questions the proposal form asks out of the box, and which of them a
 * conference keeps.
 *
 * These are hard-coded controls in `proposal-form.svelte`, not rows in the
 * `form_field` table: title, abstract, format, track and who the speaker is. The
 * builder's own fields are the questions asked *on top* of them.
 *
 * The builder used to say the opposite — "No fields yet. A form with no fields
 * collects nothing but a title", and a preview headed "What the submitter sees"
 * that read "Nothing to fill in yet". Both were untrue, and an organizer reading
 * them reasonably concludes they have to configure the obvious things
 * themselves. This list exists so the builder can show what is already asked.
 *
 * Since #159 the list is also configurable: an organizer removes the questions
 * their conference does not want, and the form, the preview and the server's own
 * validation all follow. What is stored is the set of *removed* keys, so a
 * conference that has never touched this — every conference before #159 — reads
 * as "all of them", which is what it was. A default expressed as an empty column
 * needs no backfill and cannot drift from what new conferences get.
 *
 * `FIXED_QUESTION_GROUPS` is a description of another file, which is the
 * dangerous kind of constant: it goes stale silently and the screen keeps
 * claiming something that stopped being true. `fixed-questions.unit.test.ts`
 * therefore checks it against the `name` attributes the form actually posts,
 * rather than against a copy of this list.
 */

export type FixedQuestion = {
	/**
	 * The stable name this question is stored and addressed by.
	 *
	 * The control's own posted name wherever there is exactly one, so a key is
	 * readable in the database without this file in the other hand. It is a
	 * stored value: renaming one silently un-hides a question on every conference
	 * that had removed it.
	 */
	key: string;
	/** What the submitter reads. Kept in step with the form's own wording. */
	label: string;
	/**
	 * The form control(s) this question posts. More than one where a single
	 * question is really a small group — a co-presenter is a name, a mail
	 * address and a role.
	 */
	names: string[];
	required: boolean;
	hint?: string;
	/**
	 * Set on the three questions that cannot be removed, saying why on screen.
	 *
	 * The title identifies the submission everywhere it is ever named — review
	 * queue, agenda, decision mail, public programme — so a form without one
	 * produces rows nobody can address. The speaker's name and email are what a
	 * submission is attached to a person by, and the email is the only way the
	 * decision reaches them.
	 */
	permanentBecause?: string;
};

export type FixedQuestionGroup = {
	title: string;
	questions: FixedQuestion[];
};

export const FIXED_QUESTION_GROUPS: FixedQuestionGroup[] = [
	{
		title: 'Your talk',
		questions: [
			{
				key: 'title',
				label: 'Title',
				names: ['title'],
				required: true,
				permanentBecause: 'Every list, mail and public page names the talk by its title.'
			},
			{ key: 'abstract', label: 'Abstract', names: ['abstract'], required: true },
			{ key: 'keyTakeaway', label: 'Key takeaway', names: ['keyTakeaway'], required: false },
			{
				key: 'sessionFormatId',
				label: 'Session format',
				names: ['sessionFormatId'],
				required: false,
				hint: 'Offers the formats from settings'
			},
			{
				key: 'trackId',
				label: 'Track',
				names: ['trackId'],
				required: false,
				hint: 'Offers the tracks from settings'
			},
			{ key: 'audienceLevel', label: 'Audience level', names: ['audienceLevel'], required: false }
		]
	},
	{
		title: 'About the speaker',
		questions: [
			{
				key: 'speakerName',
				label: 'Name',
				names: ['speakerName'],
				required: true,
				permanentBecause: 'A talk is filed under the person giving it.'
			},
			{
				key: 'speakerSortName',
				label: 'Sort as',
				names: ['speakerSortName'],
				required: false,
				hint: 'Guessed from the name, correctable'
			},
			{
				key: 'speakerEmail',
				label: 'Email',
				names: ['speakerEmail'],
				required: true,
				permanentBecause: 'The decision has to reach the speaker somewhere.'
			},
			{ key: 'speakerJobTitle', label: 'Job title', names: ['speakerJobTitle'], required: false },
			{ key: 'speakerCompany', label: 'Company', names: ['speakerCompany'], required: false },
			{ key: 'speakerBio', label: 'Short bio', names: ['speakerBio'], required: false },
			{
				key: 'coSpeakers',
				label: 'Co-presenters',
				names: ['co-name', 'co-email', 'co-role'],
				required: false,
				hint: 'Name, email and role, as many as they need'
			}
		]
	}
];

/** Every name the fixed part of the form posts, in the order it is asked. */
export const FIXED_QUESTION_NAMES = FIXED_QUESTION_GROUPS.flatMap((group) =>
	group.questions.flatMap((question) => question.names)
);

export const FIXED_QUESTIONS = FIXED_QUESTION_GROUPS.flatMap((group) => group.questions);

/** The keys an organizer may switch off. Everything else is structural. */
export const REMOVABLE_FIXED_KEYS = FIXED_QUESTIONS.filter((q) => !q.permanentBecause).map(
	(q) => q.key
);

/**
 * Which fixed questions this conference asks. Absent key means asked.
 *
 * A plain lookup rather than a class or a Set, because it crosses the wire to
 * two page components and has to survive `devalue` unchanged.
 */
export type FixedQuestionVisibility = Record<string, boolean>;

/**
 * Reads the stored column into the set of removed keys.
 *
 * Deliberately forgiving in one direction only. Anything unparseable, unknown or
 * not removable is dropped, because the alternative — a form that refuses to
 * render, or a title that vanishes — is worse than a question being asked that
 * somebody meant to remove. It is never forgiving about *hiding*: only a key
 * this build knows and allows can hide a control.
 */
export function parseHiddenFixedKeys(stored: string | null | undefined): string[] {
	if (!stored) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) return [];
	return parsed.filter((key): key is string => typeof key === 'string' && isRemovable(key));
}

export function isRemovable(key: string): boolean {
	return REMOVABLE_FIXED_KEYS.includes(key);
}

/** The column's value for a set of removed keys — sorted so equal sets compare equal. */
export function serializeHiddenFixedKeys(keys: string[]): string {
	return JSON.stringify([...new Set(keys.filter(isRemovable))].sort());
}

/**
 * What every renderer and the submit handler ask: is this question on the form?
 *
 * Built from the stored column rather than passed around as the raw string, so
 * that a component cannot answer the question a second, slightly different way.
 */
export function fixedQuestionVisibility(
	stored: string | null | undefined
): FixedQuestionVisibility {
	const hidden = new Set(parseHiddenFixedKeys(stored));
	return Object.fromEntries(FIXED_QUESTIONS.map((q) => [q.key, !hidden.has(q.key)]));
}

/** Everything on, for a caller with no conference in hand (previews, empty states). */
export const ALL_FIXED_QUESTIONS_SHOWN: FixedQuestionVisibility = fixedQuestionVisibility(null);

/**
 * `true` for a question this build does not know.
 *
 * A key that fell out of the list is not a question the form can hide — the
 * control is gone with it — and answering `false` would silently drop a control
 * that is still rendered.
 */
export function asks(visibility: FixedQuestionVisibility, key: string): boolean {
	return visibility[key] !== false;
}
