/**
 * Pure helpers for scorecard criteria (ABS-03 / ABS-04).
 *
 * Kept out of the server module so the rounds page and unit tests can share
 * validation without pulling the database into the client bundle.
 */

export type CriterionKind = 'rating' | 'select' | 'text';

export const CRITERION_KINDS: CriterionKind[] = ['rating', 'select', 'text'];

const MAX_LABEL = 200;
const MAX_OPTIONS = 30;
const MAX_OPTION_LEN = 80;

export type CriterionInput = {
	label: string;
	kind: string;
	scaleMax: number | null;
	/** Raw options text (one per line or comma-separated). Ignored unless kind is select. */
	optionsText: string;
	weight: number;
};

export type CriterionValues = {
	label: string;
	kind: CriterionKind;
	scaleMax: number | null;
	options: string | null;
	weight: string;
};

/** Split a free-text options field into unique non-empty choices. */
export function parseOptionsText(raw: string): string[] {
	const parts = raw
		.split(/[\n,]/)
		.map((part) => part.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of parts) {
		const clipped = part.slice(0, MAX_OPTION_LEN);
		if (seen.has(clipped.toLowerCase())) continue;
		seen.add(clipped.toLowerCase());
		out.push(clipped);
		if (out.length >= MAX_OPTIONS) break;
	}
	return out;
}

export function optionsToText(options: string[]): string {
	return options.join('\n');
}

export function isCriterionKind(value: string): value is CriterionKind {
	return (CRITERION_KINDS as string[]).includes(value);
}

function weightProblem(weight: number): string | null {
	if (!Number.isFinite(weight) || weight <= 0) return 'Weight must be a positive number.';
	if (weight > 100) return 'Weight must be 100 or less.';
	return null;
}

function kindFields(
	kind: CriterionKind,
	scaleMax: number | null,
	optionsText: string
): { ok: true; scaleMax: number | null; options: string | null } | { ok: false; message: string } {
	if (kind === 'rating') {
		if (scaleMax === null || !Number.isInteger(scaleMax) || scaleMax < 2 || scaleMax > 10) {
			return { ok: false, message: 'Rating scale must be a whole number from 2 to 10.' };
		}
		return { ok: true, scaleMax, options: null };
	}
	if (kind === 'select') {
		const list = parseOptionsText(optionsText);
		if (list.length < 2) {
			return { ok: false, message: 'A select criterion needs at least two options.' };
		}
		return { ok: true, scaleMax: null, options: JSON.stringify(list) };
	}
	// text: neither scale nor options
	return { ok: true, scaleMax: null, options: null };
}

/**
 * Validates and normalises one criterion. Wrong type combinations never leave
 * this function as a storable row — scaleMax only for rating, options only for select.
 */
export function parseCriterion(
	input: CriterionInput
): { ok: true; values: CriterionValues } | { ok: false; message: string } {
	const label = input.label.trim().slice(0, MAX_LABEL);
	if (!label) return { ok: false, message: 'Give the criterion a name.' };
	if (!isCriterionKind(input.kind)) return { ok: false, message: 'Pick a criterion type.' };

	const weightIssue = weightProblem(input.weight);
	if (weightIssue) return { ok: false, message: weightIssue };

	const fields = kindFields(input.kind, input.scaleMax, input.optionsText);
	if (!fields.ok) return fields;

	// Two decimals is what the column stores; keep the form honest.
	const weight = (Math.round(input.weight * 100) / 100).toFixed(2);

	return {
		ok: true,
		values: {
			label,
			kind: input.kind,
			scaleMax: fields.scaleMax,
			options: fields.options,
			weight
		}
	};
}

/** FormData → CriterionInput. Shared by add/update actions on the rounds page. */
export function criterionInputFromForm(form: FormData): CriterionInput {
	return {
		label: String(form.get('label') ?? ''),
		kind: String(form.get('kind') ?? ''),
		scaleMax: optionalNumber(form.get('scaleMax')),
		optionsText: String(form.get('options') ?? ''),
		weight: optionalNumber(form.get('weight')) ?? Number.NaN
	};
}

function optionalNumber(raw: FormDataEntryValue | null): number | null {
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}
