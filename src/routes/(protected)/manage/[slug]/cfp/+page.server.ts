import type { ConditionSource, FieldKind } from '$lib/conference/form-definition';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addField,
	cfpFormView,
	createCfpForm,
	deleteField,
	moveField,
	updateCfpForm,
	updateField,
	type FieldInput
} from '$lib/server/conference/cfp-form';
import type { CfpForm } from '$lib/server/db/conference/cfp-schema';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const KINDS: FieldKind[] = ['short_text', 'long_text', 'select', 'file', 'boolean'];
const SOURCES: ConditionSource[] = ['field', 'session_format', 'track'];
const STATUSES: CfpForm['status'][] = ['draft', 'published', 'closed'];

const text = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
};

const id = (form: FormData, name: string) => {
	const value = Number(text(form, name));
	return Number.isInteger(value) && value > 0 ? value : null;
};

/**
 * An empty box means "no date", not epoch 0.
 *
 * The page converts the `datetime-local` value to an ISO instant before submitting,
 * because only the browser knows which zone the organizer typed in. What arrives here
 * is therefore normally `2027-02-15T22:59:00.000Z`. A submit without JavaScript still
 * sends bare wall time, and that is read as UTC — stated rather than pretended.
 */
const when = (form: FormData, name: string) => {
	const raw = text(form, name).trim();
	if (!raw) return null;
	const value = new Date(raw);
	return Number.isNaN(value.getTime()) ? null : value;
};

/** Each condition source has its own control, so the value comes from its own input. */
function conditionValue(form: FormData, source: ConditionSource | null) {
	if (source === 'session_format') return text(form, 'conditionValueFormat');
	if (source === 'track') return text(form, 'conditionValueTrack');
	return text(form, 'conditionValue');
}

function fieldInput(form: FormData): FieldInput {
	const kind = text(form, 'kind') as FieldKind;
	const rawSource = text(form, 'conditionSource') as ConditionSource;
	const source = SOURCES.includes(rawSource) ? rawSource : null;

	return {
		label: text(form, 'label'),
		kind: KINDS.includes(kind) ? kind : 'short_text',
		required: form.get('required') !== null,
		optionsText: text(form, 'options'),
		conditionSource: source,
		conditionFieldId: id(form, 'conditionFieldId'),
		conditionValue: conditionValue(form, source)
	};
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return await cfpFormView(conference.id);
};

export const actions: Actions = {
	createForm: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		await createCfpForm(
			conference.id,
			text(form, 'title') || `${conference.name} — Call for papers`
		);
		return {
			success: true,
			message:
				'Call for papers created. It already asks for a title, an abstract and who the speaker is — add any extra questions you need.'
		};
	},

	updateForm: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const status = text(form, 'status') as CfpForm['status'];

		const updated = await updateCfpForm(conference.id, {
			title: text(form, 'title'),
			description: text(form, 'description'),
			opensAt: when(form, 'opensAt'),
			closesAt: when(form, 'closesAt'),
			status: STATUSES.includes(status) ? status : 'draft'
		});

		if (!updated)
			return fail(404, { success: false, message: 'This conference has no call for papers yet.' });
		return { success: true, message: 'Call for papers updated.' };
	},

	addField: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await addField(conference.id, fieldInput(await request.formData()));

		if (!result.ok) return fail(400, { success: false, message: result.message });
		return { success: true, message: `“${result.field.label}” added.` };
	},

	updateField: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const fieldId = id(form, 'id');

		if (!fieldId) return fail(400, { success: false, message: 'Unknown field.' });

		const result = await updateField(conference.id, fieldId, fieldInput(form));
		if (!result.ok) return fail(400, { success: false, message: result.message });
		return { success: true, message: `“${result.field.label}” saved.` };
	},

	deleteField: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const fieldId = id(await request.formData(), 'id');

		if (!fieldId || !(await deleteField(conference.id, fieldId))) {
			return fail(400, { success: false, message: 'That field is not on this form.' });
		}
		return {
			success: true,
			message: 'Field removed. Answers already given to it stay on their submissions.'
		};
	},

	moveField: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const fieldId = id(form, 'id');
		const direction = text(form, 'direction') === 'up' ? 'up' : 'down';

		if (!fieldId || !(await moveField(conference.id, fieldId, direction))) {
			return fail(400, { success: false, message: 'That field cannot move any further.' });
		}
		return { success: true, message: 'Order changed.' };
	}
};
