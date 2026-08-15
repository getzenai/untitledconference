/**
 * Structured answer to "if you take my talk, does it cost me a flight?" (#512).
 *
 * Lives on the call, not in the free-text description: a sentence an organizer
 * may forget is not an answer, and the description is dropped the moment the
 * call closes — which is when an accepted speaker starts booking.
 *
 * Unset stays unset. A missing field is not "not covered"; that would invent a
 * promise the organizer never made. A call that says nothing renders nothing.
 *
 * Stored as JSON text on `cfp_form.speaker_support`. This file is the only
 * parser and the only wording, so the builder, the public page and the speaker
 * portal cannot each invent a slightly different sentence.
 */

export const ADMISSION_KINDS = ['free', 'discounted', 'none'] as const;
export const EXPENSE_KINDS = ['none', 'up_to', 'case_by_case'] as const;

export type AdmissionKind = (typeof ADMISSION_KINDS)[number];
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export type ExpenseTerm = {
	kind: ExpenseKind;
	/** Present when `kind` is `up_to`. Free text so "€500" and "economy" both fit. */
	amount?: string;
};

export type TravelSupport = {
	kind?: ExpenseKind;
	amount?: string;
	domestic?: ExpenseTerm;
	international?: ExpenseTerm;
};

export type AccommodationSupport = {
	kind?: ExpenseKind;
	amount?: string;
	nights?: number;
	domesticNights?: number;
	internationalNights?: number;
};

export type SpeakerSupport = {
	admission?: AdmissionKind;
	travel?: TravelSupport;
	accommodation?: AccommodationSupport;
	conditions?: string;
};

export type SupportLine = {
	key: 'admission' | 'travel' | 'accommodation' | 'conditions';
	label: string;
	text: string;
};

const ADMISSION = new Set<string>(ADMISSION_KINDS);
const EXPENSE = new Set<string>(EXPENSE_KINDS);

export function isAdmissionKind(value: unknown): value is AdmissionKind {
	return typeof value === 'string' && ADMISSION.has(value);
}

export function isExpenseKind(value: unknown): value is ExpenseKind {
	return typeof value === 'string' && EXPENSE.has(value);
}

/** Amounts, nights and the domestic/international split only apply once travel or stay is actually covered. */
export function expenseIsCovered(kind: string | undefined | null): boolean {
	return kind === 'up_to' || kind === 'case_by_case';
}

function line(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function nights(value: unknown): number | undefined {
	const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isInteger(n) && n > 0 ? n : undefined;
}

function term(value: unknown): ExpenseTerm | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as { kind?: unknown; amount?: unknown };
	if (!isExpenseKind(raw.kind)) return undefined;
	const amount = raw.kind === 'up_to' ? line(raw.amount) : undefined;
	return amount ? { kind: raw.kind, amount } : { kind: raw.kind };
}

function kindAndAmount(raw: Record<string, unknown>): { kind?: ExpenseKind; amount?: string } {
	const kind = isExpenseKind(raw.kind) ? raw.kind : undefined;
	const amount = kind === 'up_to' ? line(raw.amount) : undefined;
	return { ...(kind ? { kind } : {}), ...(amount ? { amount } : {}) };
}

function travelOf(value: unknown): TravelSupport | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as Record<string, unknown>;
	const base = kindAndAmount(raw);
	const domestic = term(raw.domestic);
	const international = term(raw.international);
	if (!base.kind && !domestic && !international) return undefined;
	return {
		...base,
		...(domestic ? { domestic } : {}),
		...(international ? { international } : {})
	};
}

function stayNights(
	raw: Record<string, unknown>
): Pick<AccommodationSupport, 'nights' | 'domesticNights' | 'internationalNights'> {
	const stay = nights(raw.nights);
	const domesticNights = nights(raw.domesticNights);
	const internationalNights = nights(raw.internationalNights);
	return {
		...(stay ? { nights: stay } : {}),
		...(domesticNights ? { domesticNights } : {}),
		...(internationalNights ? { internationalNights } : {})
	};
}

function accommodationOf(value: unknown): AccommodationSupport | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as Record<string, unknown>;
	const base = kindAndAmount(raw);
	const stay = stayNights(raw);
	if (!base.kind && !stay.nights && !stay.domesticNights && !stay.internationalNights) {
		return undefined;
	}
	return { ...base, ...stay };
}

/**
 * Reads the stored column. Garbage, unknown keys and empty objects become `{}`
 * — the page then renders nothing, which is the same as a call that never set
 * the field. It is never the other way around: nothing here invents a coverage.
 */
export function parseSpeakerSupport(stored: string | null | undefined): SpeakerSupport {
	if (!stored) return {};

	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

	const raw = parsed as Record<string, unknown>;
	const support: SpeakerSupport = {};
	if (isAdmissionKind(raw.admission)) support.admission = raw.admission;
	const travel = travelOf(raw.travel);
	if (travel) support.travel = travel;
	const accommodation = accommodationOf(raw.accommodation);
	if (accommodation) support.accommodation = accommodation;
	const conditions = line(raw.conditions);
	if (conditions) support.conditions = conditions;
	return support;
}

export function hasSpeakerSupport(support: SpeakerSupport): boolean {
	return Boolean(
		support.admission || support.travel || support.accommodation || support.conditions
	);
}

/** `null` when nothing is set, so the column and a never-touched call compare equal. */
export function serializeSpeakerSupport(support: SpeakerSupport): string | null {
	const clean = parseSpeakerSupport(JSON.stringify(support));
	return hasSpeakerSupport(clean) ? JSON.stringify(clean) : null;
}

function posted(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

function postedTerm(form: FormData, kindName: string, amountName: string): ExpenseTerm | undefined {
	const kind = posted(form, kindName);
	if (!isExpenseKind(kind)) return undefined;
	const amount = kind === 'up_to' ? line(posted(form, amountName)) : undefined;
	return amount ? { kind, amount } : { kind };
}

function travelFromForm(form: FormData): TravelSupport | undefined {
	const kind = posted(form, 'travelKind');
	const covered = expenseIsCovered(kind);
	return travelOf({
		kind,
		amount: posted(form, 'travelAmount'),
		domestic: covered ? postedTerm(form, 'travelDomesticKind', 'travelDomesticAmount') : undefined,
		international: covered
			? postedTerm(form, 'travelInternationalKind', 'travelInternationalAmount')
			: undefined
	});
}

function accommodationFromForm(form: FormData): AccommodationSupport | undefined {
	const kind = posted(form, 'accommodationKind');
	const covered = expenseIsCovered(kind);
	return accommodationOf({
		kind,
		amount: posted(form, 'accommodationAmount'),
		nights: covered ? posted(form, 'accommodationNights') : '',
		domesticNights: covered ? posted(form, 'accommodationDomesticNights') : '',
		internationalNights: covered ? posted(form, 'accommodationInternationalNights') : ''
	});
}

function anythingCovered(support: SpeakerSupport): boolean {
	return (
		support.admission === 'free' ||
		support.admission === 'discounted' ||
		expenseIsCovered(support.travel?.kind) ||
		expenseIsCovered(support.accommodation?.kind)
	);
}

/** The names the CFP settings form posts. One reader, used by the action. */
export function speakerSupportFromForm(form: FormData): SpeakerSupport {
	const admissionRaw = posted(form, 'admission');
	const support: SpeakerSupport = {};
	if (isAdmissionKind(admissionRaw)) support.admission = admissionRaw;
	const travel = travelFromForm(form);
	if (travel) support.travel = travel;
	const accommodation = accommodationFromForm(form);
	if (accommodation) support.accommodation = accommodation;
	const conditions = anythingCovered(support) ? line(posted(form, 'supportConditions')) : undefined;
	if (conditions) support.conditions = conditions;
	return support;
}

const ADMISSION_TEXT: Record<AdmissionKind, string> = {
	free: 'Free for speakers',
	discounted: 'Discounted for speakers',
	none: 'Not covered'
};

function expenseText(kind: ExpenseKind | undefined, amount?: string): string | null {
	if (!kind) return null;
	if (kind === 'none') return 'Not covered';
	if (kind === 'case_by_case') return 'Covered case by case';
	return amount ? `Covered up to ${amount}` : 'Covered up to a set amount';
}

function travelText(travel: TravelSupport): string | null {
	const split = travel.domestic || travel.international;
	if (split) {
		const parts: string[] = [];
		if (travel.domestic) {
			const text = expenseText(travel.domestic.kind, travel.domestic.amount ?? travel.amount);
			if (text) parts.push(`Domestic: ${text.toLowerCase()}`);
		}
		if (travel.international) {
			const text = expenseText(
				travel.international.kind,
				travel.international.amount ?? travel.amount
			);
			if (text) parts.push(`International: ${text.toLowerCase()}`);
		}
		return parts.length > 0 ? parts.join('. ') : null;
	}
	return expenseText(travel.kind, travel.amount);
}

function nightsText(accommodation: AccommodationSupport): string | null {
	if (accommodation.domesticNights || accommodation.internationalNights) {
		const parts: string[] = [];
		if (accommodation.domesticNights) {
			parts.push(
				`${accommodation.domesticNights} ${accommodation.domesticNights === 1 ? 'night' : 'nights'} domestic`
			);
		}
		if (accommodation.internationalNights) {
			parts.push(
				`${accommodation.internationalNights} ${accommodation.internationalNights === 1 ? 'night' : 'nights'} international`
			);
		}
		return parts.join(', ');
	}
	if (!accommodation.nights) return null;
	return `${accommodation.nights} ${accommodation.nights === 1 ? 'night' : 'nights'}`;
}

function accommodationText(accommodation: AccommodationSupport): string | null {
	const stay = nightsText(accommodation);
	const cover = expenseText(accommodation.kind, accommodation.amount);
	if (stay && cover) return `${stay}, ${cover.toLowerCase()}`;
	return stay ?? cover;
}

/** The labelled lines both surfaces print. Empty when the call said nothing. */
export function speakerSupportLines(support: SpeakerSupport): SupportLine[] {
	const lines: SupportLine[] = [];
	if (support.admission) {
		lines.push({ key: 'admission', label: 'Admission', text: ADMISSION_TEXT[support.admission] });
	}
	const travel = support.travel ? travelText(support.travel) : null;
	if (travel) lines.push({ key: 'travel', label: 'Travel', text: travel });
	const stay = support.accommodation ? accommodationText(support.accommodation) : null;
	if (stay) lines.push({ key: 'accommodation', label: 'Accommodation', text: stay });
	if (support.conditions) {
		lines.push({ key: 'conditions', label: 'Conditions', text: support.conditions });
	}
	return lines;
}
