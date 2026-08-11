/**
 * The questions every proposal form asks, whatever the organizer configures.
 *
 * These are hard-coded fields in `proposal-form.svelte`, not rows in the form
 * builder: a submitter is always asked for a title, an abstract, a format, a
 * track and who they are. The builder is for the questions *on top* of that.
 *
 * The builder used to say the opposite — "No fields yet. A form with no fields
 * collects nothing but a title", and a preview headed "What the submitter sees"
 * that read "Nothing to fill in yet". Both were untrue, and an organizer reading
 * them reasonably concludes they have to configure the obvious things
 * themselves. This list exists so the builder can show what is already asked.
 *
 * It is a description of another file, which is the dangerous kind of constant:
 * it goes stale silently and the screen keeps claiming something that stopped
 * being true. `fixed-questions.unit.test.ts` therefore checks it against the
 * `name` attributes the form actually posts, rather than against a copy of this
 * list.
 */

export type FixedQuestion = {
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
};

export type FixedQuestionGroup = {
	title: string;
	questions: FixedQuestion[];
};

export const FIXED_QUESTION_GROUPS: FixedQuestionGroup[] = [
	{
		title: 'Your talk',
		questions: [
			{ label: 'Title', names: ['title'], required: true },
			{ label: 'Abstract', names: ['abstract'], required: true },
			{ label: 'Key takeaway', names: ['keyTakeaway'], required: false },
			{
				label: 'Session format',
				names: ['sessionFormatId'],
				required: false,
				hint: 'Offers the formats from settings'
			},
			{
				label: 'Track',
				names: ['trackId'],
				required: false,
				hint: 'Offers the tracks from settings'
			},
			{ label: 'Audience level', names: ['audienceLevel'], required: false }
		]
	},
	{
		title: 'About the speaker',
		questions: [
			{ label: 'Name', names: ['speakerName'], required: true },
			{
				label: 'Sort as',
				names: ['speakerSortName'],
				required: false,
				hint: 'Guessed from the name, correctable'
			},
			{ label: 'Email', names: ['speakerEmail'], required: true },
			{ label: 'Job title', names: ['speakerJobTitle'], required: false },
			{ label: 'Company', names: ['speakerCompany'], required: false },
			{ label: 'Short bio', names: ['speakerBio'], required: false },
			{
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
