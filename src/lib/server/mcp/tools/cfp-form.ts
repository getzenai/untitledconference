/**
 * Form-builder tools (#712). Each one calls the same function the CFP screen
 * calls — cfpFormView, updateCfpForm, addField, updateField, deleteField,
 * moveField, setFixedQuestionShown. The form actions stay untouched.
 */
import {
	FIXED_QUESTIONS,
	fixedQuestionVisibility,
	isRemovable,
	parseHiddenFixedKeys
} from '$lib/conference/fixed-questions';
import {
	parseOptions,
	type ConditionSource,
	type FieldKind
} from '$lib/conference/form-definition';
import {
	addField,
	cfpFormView,
	deleteField,
	moveField,
	setFixedQuestionShown,
	updateCfpForm,
	updateField,
	type FieldInput
} from '$lib/server/conference/cfp-form';
import type { CfpForm, FormField } from '$lib/server/db/conference/cfp-schema';
import { z } from 'zod';
import type { McpContext } from '../context';
import { organizerConference } from '../organizer';
import { McpToolError, type AnyMcpToolDefinition } from '../tool-helpers';

const slugField = z
	.string()
	.min(1)
	.describe('Conference slug, from list_my_conferences or get_cfp_form.');

const fieldIdField = z
	.number()
	.int()
	.positive()
	.describe('Field id from get_cfp_form. Never invent one from the page title.');

const fieldKind = z
	.enum(['short_text', 'long_text', 'select', 'file', 'boolean'])
	.describe('short_text, long_text, select, file or boolean.');

const conditionSource = z
	.enum(['field', 'session_format', 'track'])
	.nullable()
	.optional()
	.describe(
		'Show this field only when a format, track or another answer matches. Null means always.'
	);

const isoInstant = z.string().min(1).describe('ISO-8601 instant (e.g. 2027-10-01T09:00:00.000Z).');

const fieldShape = {
	label: z.string().describe('What the submitter reads.'),
	kind: fieldKind,
	required: z
		.boolean()
		.optional()
		.describe('Whether a visible submitter must answer. Defaults to false.'),
	options: z
		.array(z.string())
		.optional()
		.describe(
			'Choices for a select, in order. Ignored on other kinds. Required when kind is select.'
		),
	conditionSource,
	conditionFieldId: z
		.number()
		.int()
		.positive()
		.nullable()
		.optional()
		.describe('When conditionSource is field, the parent field id from get_cfp_form.'),
	conditionValue: z
		.string()
		.nullable()
		.optional()
		.describe('The format id, track id or answer the rule matches. Required when a source is set.')
};

function parseInstant(value: string | null | undefined, label: string): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new McpToolError(`${label} is not a real instant. Use ISO-8601.`);
	}
	return date;
}

type FormPatch = {
	title?: string;
	description?: string | null;
	opensAt?: string | null;
	closesAt?: string | null;
	status?: CfpForm['status'];
};

function requireFormPatch(patch: FormPatch): void {
	if (
		patch.title === undefined &&
		patch.description === undefined &&
		patch.opensAt === undefined &&
		patch.closesAt === undefined &&
		patch.status === undefined
	) {
		throw new McpToolError('Pass at least one of title, description, opensAt, closesAt or status.');
	}
}

function formMetaFromPatch(form: CfpForm, patch: FormPatch) {
	return {
		title: patch.title ?? form.title,
		description:
			patch.description === undefined ? (form.description ?? '') : (patch.description ?? ''),
		opensAt:
			patch.opensAt === undefined ? form.opensAt : (parseInstant(patch.opensAt, 'opensAt') ?? null),
		closesAt:
			patch.closesAt === undefined
				? form.closesAt
				: (parseInstant(patch.closesAt, 'closesAt') ?? null),
		status: patch.status ?? form.status
	};
}

function fieldInput(args: {
	label: string;
	kind: FieldKind;
	required?: boolean;
	options?: string[];
	conditionSource?: ConditionSource | null;
	conditionFieldId?: number | null;
	conditionValue?: string | null;
}): FieldInput {
	return {
		label: args.label,
		kind: args.kind,
		required: args.required ?? false,
		optionsText: (args.options ?? []).join('\n'),
		conditionSource: args.conditionSource ?? null,
		conditionFieldId: args.conditionFieldId ?? null,
		conditionValue: args.conditionValue ?? null
	};
}

function presentField(field: FormField) {
	return {
		id: field.id,
		label: field.label,
		kind: field.kind,
		required: field.required,
		position: field.position,
		options: parseOptions(field.options),
		conditionSource: field.conditionSource,
		conditionFieldId: field.conditionFieldId,
		conditionValue: field.conditionValue
	};
}

function presentForm(form: CfpForm) {
	const visibility = fixedQuestionVisibility(form.hiddenFixedFields);
	return {
		title: form.title,
		description: form.description,
		status: form.status,
		opensAt: form.opensAt?.toISOString() ?? null,
		closesAt: form.closesAt?.toISOString() ?? null,
		hiddenFixedQuestions: parseHiddenFixedKeys(form.hiddenFixedFields),
		fixedQuestions: FIXED_QUESTIONS.map((question) => ({
			key: question.key,
			label: question.label,
			shown: visibility[question.key] !== false,
			removable: isRemovable(question.key)
		})),
		speakerSupport: form.speakerSupport
	};
}

function getCfpFormTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_cfp_form',
		writes: false,
		description:
			'Read the call-for-papers builder on a conference you organize — title, window, ' +
			'status, built-in questions, extra fields, tracks and formats. Field ids come ' +
			'from here; do not invent them from the page title. A null form means the call ' +
			'has not been created yet — call open_cfp first. Does not create a form.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const view = await cfpFormView(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				form: view.form ? presentForm(view.form) : null,
				fields: view.fields.map(presentField),
				tracks: view.tracks,
				formats: view.formats
			};
		}
	};
}

function updateCfpFormTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'update_cfp_form',
		writes: true,
		description:
			'Change the title, description, submission window or status of the call on a ' +
			'conference you organize. Same write as the builder Save. Omit a field to leave ' +
			'it. Does not add or edit questions — use add_cfp_field and update_cfp_field. ' +
			'open_cfp and close_cfp stay the status switch when that is all you want.',
		inputSchema: {
			conferenceSlug: slugField,
			title: z.string().optional().describe('New title. Omit to keep the current one.'),
			description: z
				.string()
				.nullable()
				.optional()
				.describe('What a submitter should know before they start. Null clears it.'),
			opensAt: isoInstant.nullable().optional().describe('When submissions open. Null clears it.'),
			closesAt: isoInstant
				.nullable()
				.optional()
				.describe('When submissions close. Null clears it.'),
			status: z
				.enum(['draft', 'published', 'closed'])
				.optional()
				.describe('draft, published or closed. Omit to keep the current one.')
		},
		handler: async (patch) => {
			requireFormPatch(patch);
			const conference = await organizerConference(patch.conferenceSlug, ctx);
			const view = await cfpFormView(conference.id);
			if (!view.form) {
				throw new McpToolError('This conference has no call for papers yet.');
			}
			const updated = await updateCfpForm(conference.id, formMetaFromPatch(view.form, patch));
			if (!updated) {
				throw new McpToolError('This conference has no call for papers yet.');
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				form: presentForm(updated)
			};
		}
	};
}

function addCfpFieldTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'add_cfp_field',
		writes: true,
		description:
			'Add an extra question to the call on a conference you organize. Same write as ' +
			'the builder Add field. A select needs at least one option. Conditions go through ' +
			'the same checks the screen uses. The new field id is in the result; also listed ' +
			'by get_cfp_form.',
		inputSchema: { conferenceSlug: slugField, ...fieldShape },
		handler: async (args) => {
			const conference = await organizerConference(args.conferenceSlug, ctx);
			const result = await addField(conference.id, fieldInput(args));
			if (!result.ok) throw new McpToolError(result.message);
			return {
				conference: { slug: conference.slug, name: conference.name },
				field: presentField(result.field)
			};
		}
	};
}

function updateCfpFieldTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'update_cfp_field',
		writes: true,
		description:
			'Change an extra question on the call. Same write as the builder Save on a field. ' +
			'fieldId comes from get_cfp_form. Send the whole field — omitted options on a ' +
			'select clear them and are refused.',
		inputSchema: { conferenceSlug: slugField, fieldId: fieldIdField, ...fieldShape },
		handler: async (args) => {
			const conference = await organizerConference(args.conferenceSlug, ctx);
			const result = await updateField(conference.id, args.fieldId, fieldInput(args));
			if (!result.ok) throw new McpToolError(result.message);
			return {
				conference: { slug: conference.slug, name: conference.name },
				field: presentField(result.field)
			};
		}
	};
}

function deleteCfpFieldTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'delete_cfp_field',
		writes: true,
		description:
			'Remove an extra question from the call. Same write as the builder Remove. ' +
			'Answers already given stay on their submissions. fieldId comes from get_cfp_form.',
		inputSchema: { conferenceSlug: slugField, fieldId: fieldIdField },
		handler: async ({ conferenceSlug, fieldId }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			if (!(await deleteField(conference.id, fieldId))) {
				throw new McpToolError('That field is not on this form.');
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				deletedFieldId: fieldId
			};
		}
	};
}

function moveCfpFieldTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'move_cfp_field',
		writes: true,
		description:
			'Move an extra question one place up or down. Same write as the builder arrows. ' +
			'fieldId comes from get_cfp_form. Refused at either end of the list.',
		inputSchema: {
			conferenceSlug: slugField,
			fieldId: fieldIdField,
			direction: z
				.enum(['up', 'down'])
				.describe('up toward the top of the form, down toward the bottom.')
		},
		handler: async ({ conferenceSlug, fieldId, direction }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			if (!(await moveField(conference.id, fieldId, direction))) {
				throw new McpToolError('That field cannot move any further.');
			}
			const view = await cfpFormView(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				fields: view.fields.map(presentField)
			};
		}
	};
}

function setCfpFixedQuestionTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'set_cfp_fixed_question',
		writes: true,
		description:
			'Hide or show one built-in question on the call (abstract, track, key takeaway…). ' +
			'Same write as the builder hide/show on a fixed question. Title and speaker ' +
			'identity cannot be hidden. The key comes from get_cfp_form.',
		inputSchema: {
			conferenceSlug: slugField,
			key: z
				.string()
				.min(1)
				.describe('Fixed-question key from get_cfp_form (e.g. abstract, trackId).'),
			shown: z.boolean().describe('true puts the question back; false takes it off this call.')
		},
		handler: async ({ conferenceSlug, key, shown }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			if (!(await setFixedQuestionShown(conference.id, key, shown))) {
				throw new McpToolError('That question cannot be changed.');
			}
			const view = await cfpFormView(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				key,
				shown,
				form: view.form ? presentForm(view.form) : null
			};
		}
	};
}

export function cfpFormTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [
		getCfpFormTool(ctx),
		updateCfpFormTool(ctx),
		addCfpFieldTool(ctx),
		updateCfpFieldTool(ctx),
		deleteCfpFieldTool(ctx),
		moveCfpFieldTool(ctx),
		setCfpFixedQuestionTool(ctx)
	];
}
