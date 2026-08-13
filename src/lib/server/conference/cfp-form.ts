/**
 * The organizer's side of Ü1: defining the form submitters will fill in.
 *
 * Two things this module refuses to do, both learned from the rest of the product:
 *
 * - **It never writes on a load.** Opening the builder does not create a form; the
 *   organizer creates it with a click that says so. A loader with a side effect makes
 *   a refresh a state change.
 * - **Every mutation re-derives the form from the conference id.** The field id in a
 *   request is user input. `requireOrganizer` proves the caller may edit THIS
 *   conference; it says nothing about the field id they typed, and a builder that
 *   takes the id at face value lets an organizer of conference A rewrite the form of
 *   conference B.
 */
import {
	isRemovable,
	parseHiddenFixedKeys,
	serializeHiddenFixedKeys
} from '$lib/conference/fixed-questions';
import {
	optionsFromText,
	validateDefinition,
	type ConditionSource,
	type FieldKind
} from '$lib/conference/form-definition';
import { db } from '$lib/server/db';
import {
	cfpFormTable,
	formFieldTable,
	type CfpForm,
	type FormField
} from '$lib/server/db/conference/cfp-schema';
import { sessionFormatTable, trackTable } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

export type CfpFormView = {
	form: CfpForm | null;
	fields: FormField[];
	tracks: { id: number; name: string }[];
	formats: { id: number; name: string }[];
};

/** Everything the builder screen shows, including what conditions can point at. */
export async function cfpFormView(conferenceId: number): Promise<CfpFormView> {
	const [form] = await db
		.select()
		.from(cfpFormTable)
		.where(eq(cfpFormTable.conferenceId, conferenceId))
		.orderBy(asc(cfpFormTable.id))
		.limit(1);

	const [fields, tracks, formats] = await Promise.all([
		form
			? db
					.select()
					.from(formFieldTable)
					.where(eq(formFieldTable.cfpFormId, form.id))
					.orderBy(asc(formFieldTable.position), asc(formFieldTable.id))
			: Promise.resolve([]),
		db
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position)),
		db
			.select({ id: sessionFormatTable.id, name: sessionFormatTable.name })
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position))
	]);

	return { form: form ?? null, fields, tracks, formats };
}

/** The conference's form, or null — the gate every mutation below goes through. */
async function formOf(conferenceId: number): Promise<CfpForm | null> {
	const [form] = await db
		.select()
		.from(cfpFormTable)
		.where(eq(cfpFormTable.conferenceId, conferenceId))
		.orderBy(asc(cfpFormTable.id))
		.limit(1);

	return form ?? null;
}

export async function createCfpForm(conferenceId: number, title: string): Promise<CfpForm> {
	const existing = await formOf(conferenceId);
	if (existing) return existing;

	const [form] = await db
		.insert(cfpFormTable)
		.values({ conferenceId, title: title.trim() || 'Call for papers' })
		.returning();

	return form;
}

export type FormMeta = {
	title: string;
	description: string;
	opensAt: Date | null;
	closesAt: Date | null;
	status: CfpForm['status'];
};

export async function updateCfpForm(conferenceId: number, meta: FormMeta): Promise<CfpForm | null> {
	const form = await formOf(conferenceId);
	if (!form) return null;

	const [updated] = await db
		.update(cfpFormTable)
		.set({
			title: meta.title.trim() || form.title,
			// An emptied box means "say nothing here", so it becomes null rather than
			// an empty string — the page tests for content, not for a value.
			description: meta.description.trim() || null,
			opensAt: meta.opensAt,
			closesAt: meta.closesAt,
			status: meta.status
		})
		.where(eq(cfpFormTable.id, form.id))
		.returning();

	return updated;
}

function formMeta(
	form: CfpForm,
	over: Partial<Pick<FormMeta, 'status' | 'opensAt' | 'closesAt' | 'title'>> = {}
): FormMeta {
	return {
		title: over.title ?? form.title,
		description: form.description ?? '',
		opensAt: over.opensAt !== undefined ? over.opensAt : form.opensAt,
		closesAt: over.closesAt !== undefined ? over.closesAt : form.closesAt,
		status: over.status ?? form.status
	};
}

/**
 * The settings-screen "Publish the call" action. Does not create a form — a
 * missing form is a missing click, not an implied one. The MCP `open_cfp` tool
 * calls `createCfpForm` first when there is nothing to publish.
 */
export async function publishCfpForm(
	conferenceId: number,
	over: { title?: string; opensAt?: Date | null; closesAt?: Date | null } = {}
): Promise<CfpForm | null> {
	const form = await formOf(conferenceId);
	if (!form) return null;
	return updateCfpForm(conferenceId, formMeta(form, { ...over, status: 'published' }));
}

/** The settings-screen "Close the call" action. */
export async function closeCfpForm(conferenceId: number): Promise<CfpForm | null> {
	const form = await formOf(conferenceId);
	if (!form) return null;
	return updateCfpForm(conferenceId, formMeta(form, { status: 'closed' }));
}

/**
 * Switches one of the form's built-in questions off or back on (#159).
 *
 * The whole set is read and rewritten rather than the one key being appended,
 * because the column is a set and `serializeHiddenFixedKeys` is the only thing
 * that decides what a valid set looks like — de-duplicated, sorted, and free of
 * keys this build cannot honour. A caller that appended would eventually store
 * `["abstract","abstract"]` and the screen would count two removals.
 *
 * Returns false for a question nobody may remove, so the route says so rather
 * than reporting a save that changed nothing. The check is here and not only in
 * the page for the usual reason: the field key arrives in a request.
 */
export async function setFixedQuestionShown(
	conferenceId: number,
	key: string,
	shown: boolean
): Promise<boolean> {
	if (!isRemovable(key)) return false;

	const form = await formOf(conferenceId);
	if (!form) return false;

	const hidden = new Set(parseHiddenFixedKeys(form.hiddenFixedFields));
	if (shown) hidden.delete(key);
	else hidden.add(key);

	await db
		.update(cfpFormTable)
		.set({ hiddenFixedFields: serializeHiddenFixedKeys([...hidden]) })
		.where(eq(cfpFormTable.id, form.id));

	return true;
}

export type FieldInput = {
	label: string;
	kind: FieldKind;
	required: boolean;
	/** One option per line, as the builder's textarea supplies them. */
	optionsText: string;
	conditionSource: ConditionSource | null;
	conditionFieldId: number | null;
	conditionValue: string | null;
};

/** `null` when the input is fine, otherwise the sentence the organizer reads. */
function reject(input: FieldInput): string | null {
	return validateDefinition({
		label: input.label,
		kind: input.kind,
		options: optionsFromText(input.optionsText),
		conditionSource: input.conditionSource,
		conditionFieldId: input.conditionFieldId,
		conditionValue: input.conditionValue
	});
}

/**
 * The other field id in this request — and the one place the conference scope is easy
 * to forget, because it is not the field being written.
 *
 * Unchecked it takes any id at all: a field of a NEIGHBOURING conference (accepted,
 * stored, and a foreign key whose deletion then reaches into this form) or one that
 * does not exist (a raw foreign-key violation, i.e. a 500 where the organizer should
 * have read a sentence).
 */
async function conditionProblem(
	formId: number,
	selfId: number | null,
	input: FieldInput
): Promise<string | null> {
	if (input.conditionSource !== 'field') return null;
	if (input.conditionFieldId === selfId) return 'A field cannot depend on itself.';

	const [parent] = await db
		.select({ id: formFieldTable.id })
		.from(formFieldTable)
		.where(
			and(eq(formFieldTable.id, input.conditionFieldId!), eq(formFieldTable.cfpFormId, formId))
		)
		.limit(1);

	return parent ? null : 'That rule points at a field that is not on this form.';
}

/** Only a `select` keeps options, and only a `field` condition keeps a field id. */
function columnsFor(input: FieldInput) {
	const options = optionsFromText(input.optionsText);

	return {
		label: input.label.trim(),
		kind: input.kind,
		required: input.required,
		options: input.kind === 'select' ? JSON.stringify(options) : null,
		conditionSource: input.conditionSource,
		conditionFieldId: input.conditionSource === 'field' ? input.conditionFieldId : null,
		conditionValue: input.conditionSource ? (input.conditionValue?.trim() ?? null) : null
	};
}

export type FieldResult = { ok: true; field: FormField } | { ok: false; message: string };

export async function addField(conferenceId: number, input: FieldInput): Promise<FieldResult> {
	const form = await formOf(conferenceId);
	if (!form) return { ok: false, message: 'Create the call for papers first.' };

	const problem = reject(input) ?? (await conditionProblem(form.id, null, input));
	if (problem) return { ok: false, message: problem };

	const [{ next } = { next: 0 }] = await db
		.select({ next: sql<number>`coalesce(max(${formFieldTable.position}), -1) + 1` })
		.from(formFieldTable)
		.where(eq(formFieldTable.cfpFormId, form.id));

	const [field] = await db
		.insert(formFieldTable)
		.values({ cfpFormId: form.id, position: Number(next), ...columnsFor(input) })
		.returning();

	return { ok: true, field };
}

export async function updateField(
	conferenceId: number,
	fieldId: number,
	input: FieldInput
): Promise<FieldResult> {
	const form = await formOf(conferenceId);
	if (!form) return { ok: false, message: 'Create the call for papers first.' };

	const problem = reject(input) ?? (await conditionProblem(form.id, fieldId, input));
	if (problem) return { ok: false, message: problem };

	const columns = columnsFor(input);

	const [field] = await db
		.update(formFieldTable)
		.set(columns)
		.where(and(eq(formFieldTable.id, fieldId), eq(formFieldTable.cfpFormId, form.id)))
		.returning();

	return field ? { ok: true, field } : { ok: false, message: 'That field is not on this form.' };
}

export async function deleteField(conferenceId: number, fieldId: number): Promise<boolean> {
	const form = await formOf(conferenceId);
	if (!form) return false;

	const deleted = await db
		.delete(formFieldTable)
		.where(and(eq(formFieldTable.id, fieldId), eq(formFieldTable.cfpFormId, form.id)))
		.returning({ id: formFieldTable.id });

	return deleted.length > 0;
}

/**
 * Moves a field one place up or down by swapping positions with its neighbour.
 *
 * A swap rather than "set position = n": two fields can share a position after any
 * hand-edit or import, and renumbering the whole form on every click is how order
 * silently changes somewhere else on the list.
 */
export async function moveField(
	conferenceId: number,
	fieldId: number,
	direction: 'up' | 'down'
): Promise<boolean> {
	const form = await formOf(conferenceId);
	if (!form) return false;

	const fields = await db
		.select({ id: formFieldTable.id, position: formFieldTable.position })
		.from(formFieldTable)
		.where(eq(formFieldTable.cfpFormId, form.id))
		.orderBy(asc(formFieldTable.position), asc(formFieldTable.id));

	const index = fields.findIndex((f) => f.id === fieldId);
	const target = direction === 'up' ? index - 1 : index + 1;
	if (index === -1 || target < 0 || target >= fields.length) return false;

	// Positions are rewritten from the reordered list, so duplicates left by an older
	// write heal on the first move instead of making the next swap a no-op.
	const reordered = [...fields];
	[reordered[index], reordered[target]] = [reordered[target], reordered[index]];

	await db.transaction(async (tx) => {
		for (const [position, field] of reordered.entries()) {
			if (field.position === position) continue;
			await tx.update(formFieldTable).set({ position }).where(eq(formFieldTable.id, field.id));
		}
	});

	return true;
}

/** Used by the public form and by the submission handler — one definition, one order. */
export async function publishedFormFor(conferenceId: number) {
	const [form] = await db
		.select()
		.from(cfpFormTable)
		.where(
			and(
				eq(cfpFormTable.conferenceId, conferenceId),
				inArray(cfpFormTable.status, ['published', 'closed'])
			)
		)
		.orderBy(asc(cfpFormTable.id))
		.limit(1);

	if (!form) return null;

	const fields = await db
		.select()
		.from(formFieldTable)
		.where(eq(formFieldTable.cfpFormId, form.id))
		.orderBy(asc(formFieldTable.position), asc(formFieldTable.id));

	return { form, fields };
}
