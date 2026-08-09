/**
 * The one reading of a configured CFP form (CFP-01, CFP-02).
 *
 * The organizer's builder, the public submission form and the server that accepts the
 * submission all have to agree on two questions: which fields are shown, and which
 * answers are acceptable. Three implementations of that would be three chances for the
 * form to demand something it never displayed. So the rules live here, in one file
 * with no database and no Svelte in it, and every surface asks this module.
 *
 * The rule that carries the most weight is the smallest one: **a hidden field is never
 * required.** Conditional logic that can still block a submission with an invisible
 * error is worse than no conditional logic at all.
 */

export type FieldKind = 'short_text' | 'long_text' | 'select' | 'file' | 'boolean';

export type ConditionSource = 'field' | 'session_format' | 'track';

/** The subset of `form_field` these rules need — no row type, so the tests stay honest. */
export type FieldDefinition = {
	id: number;
	label: string;
	kind: FieldKind;
	required: boolean;
	position: number;
	/** JSON array of strings as stored, or already-parsed choices. */
	options: string | string[] | null;
	conditionSource: ConditionSource | null;
	conditionFieldId: number | null;
	conditionValue: string | null;
};

/** What the submitter has entered so far. Answers are keyed by field id. */
export type AnswerContext = {
	sessionFormatId: number | null;
	trackId: number | null;
	answers: Record<number, string | null | undefined>;
};

export const FIELD_KINDS: { value: FieldKind; label: string }[] = [
	{ value: 'short_text', label: 'Short text' },
	{ value: 'long_text', label: 'Long text' },
	{ value: 'select', label: 'Dropdown' },
	{ value: 'boolean', label: 'Yes / no' },
	{ value: 'file', label: 'File' }
];

/**
 * Choices for a dropdown.
 *
 * Stored as a JSON array of strings, and tolerant on the way out: a field whose
 * options never parse renders as a dropdown with nothing in it, which is visibly
 * broken. Throwing here would take the whole form down instead.
 */
export function parseOptions(options: FieldDefinition['options']): string[] {
	if (Array.isArray(options)) return options.filter((o) => typeof o === 'string');
	if (!options) return [];
	try {
		const parsed: unknown = JSON.parse(options);
		return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : [];
	} catch {
		return [];
	}
}

/** One option per line, which is how the builder asks for them. */
export function optionsFromText(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

const isBlank = (value: string | null | undefined) => !value || value.trim() === '';

/**
 * Is this field shown, given what has been chosen so far?
 *
 * Conditions chain: a field that depends on an answer to a hidden field is itself
 * hidden, because that answer cannot have been given. The `seen` set is not
 * paranoia — the builder lets an organizer point two fields at each other, and a
 * cycle must render as "not shown", never as a hung page.
 */
export function isVisible(
	field: FieldDefinition,
	ctx: AnswerContext,
	all: FieldDefinition[] = [],
	seen: Set<number> = new Set()
): boolean {
	if (!field.conditionSource) return true;
	if (seen.has(field.id)) return false;
	seen.add(field.id);

	const expected = field.conditionValue;
	// A rule with no value to match is not a rule. Hiding on it would make an
	// unfinished edit look like a deleted field.
	if (isBlank(expected)) return true;

	return field.conditionSource === 'field'
		? matchesAnswer(field, expected!, ctx, all, seen)
		: matchesChoice(field.conditionSource, expected!, ctx);
}

/** Session format and track are columns on the submission, matched by id. */
function matchesChoice(
	source: Exclude<ConditionSource, 'field'>,
	expected: string,
	ctx: AnswerContext
): boolean {
	const chosen = source === 'session_format' ? ctx.sessionFormatId : ctx.trackId;
	return String(chosen ?? '') === expected;
}

function matchesAnswer(
	field: FieldDefinition,
	expected: string,
	ctx: AnswerContext,
	all: FieldDefinition[],
	seen: Set<number>
): boolean {
	const parent = all.find((f) => f.id === field.conditionFieldId);
	// A condition whose field has been deleted is not a reason to hide anything: the
	// `on delete set null` leaves the rule pointing nowhere, and a field nobody can
	// ever see again is the worse failure.
	if (!parent) return true;
	if (!isVisible(parent, ctx, all, seen)) return false;

	return (ctx.answers[parent.id] ?? '') === expected;
}

export function visibleFields(fields: FieldDefinition[], ctx: AnswerContext): FieldDefinition[] {
	return [...fields]
		.sort((a, b) => a.position - b.position || a.id - b.id)
		.filter((field) => isVisible(field, ctx, fields));
}

export type FieldErrors = Record<number, string>;

/**
 * What is wrong with the answers, per field.
 *
 * Only visible fields are checked — see the file comment. A dropdown answer is
 * checked against its own options, because a value that never appeared in the list
 * arrived by editing the request, not by using the form.
 */
export function validateAnswers(fields: FieldDefinition[], ctx: AnswerContext): FieldErrors {
	const errors: FieldErrors = {};

	for (const field of visibleFields(fields, ctx)) {
		const value = ctx.answers[field.id];

		if (field.required && isBlank(value)) {
			errors[field.id] = `${field.label} is required.`;
			continue;
		}
		if (isBlank(value)) continue;

		if (field.kind === 'select') {
			const options = parseOptions(field.options);
			if (options.length > 0 && !options.includes(value!.trim())) {
				errors[field.id] = `${field.label}: pick one of the offered options.`;
			}
		}
		if (field.kind === 'boolean' && !['true', 'false'].includes(value!.trim())) {
			errors[field.id] = `${field.label}: answer yes or no.`;
		}
	}

	return errors;
}

/**
 * What is wrong with a field DEFINITION, in the builder.
 *
 * Separate from answer validation on purpose: this one runs while the organizer is
 * still building, and its job is to stop a form from reaching a submitter in a state
 * where it cannot be filled in correctly.
 */
export function validateDefinition(
	field: Pick<FieldDefinition, 'label' | 'kind' | 'options' | 'conditionSource' | 'conditionValue'>
): string | null {
	if (isBlank(field.label)) return 'Give the field a label — it is what the submitter reads.';
	if (field.kind === 'select' && parseOptions(field.options).length === 0) {
		return 'A dropdown needs at least one option.';
	}
	if (field.conditionSource && isBlank(field.conditionValue)) {
		return 'A visibility rule needs the value it should match.';
	}
	return null;
}
