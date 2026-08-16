/**
 * Form-builder tools, asked of the definitions themselves: each one is the
 * wrap the spec names, and a refusal from the domain function is the message
 * the model sees. The screen's write is measured in the integration test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	organizerConference,
	cfpFormView,
	updateCfpForm,
	addField,
	updateField,
	deleteField,
	moveField,
	setFixedQuestionShown
} = vi.hoisted(() => ({
	organizerConference: vi.fn(),
	cfpFormView: vi.fn(),
	updateCfpForm: vi.fn(),
	addField: vi.fn(),
	updateField: vi.fn(),
	deleteField: vi.fn(),
	moveField: vi.fn(),
	setFixedQuestionShown: vi.fn()
}));

vi.mock('../organizer', () => ({ organizerConference }));
vi.mock('$lib/server/conference/cfp-form', () => ({
	cfpFormView,
	updateCfpForm,
	addField,
	updateField,
	deleteField,
	moveField,
	setFixedQuestionShown
}));

import { validateDefinition } from '$lib/conference/form-definition';
import type { McpContext } from '../context';
import { McpToolError } from '../tool-helpers';
import { cfpFormTools } from './cfp-form';

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1' };
const conference = { id: 7, slug: 'devflow', name: 'DevFlow' };

function tool(name: string) {
	const found = cfpFormTools(ctx).find((entry) => entry.name === name);
	if (!found) throw new Error(`missing tool ${name}`);
	return found;
}

async function reject(name: string, args: Record<string, unknown>): Promise<McpToolError> {
	try {
		await tool(name).handler(args);
	} catch (error) {
		if (error instanceof McpToolError) return error;
		throw error;
	}
	throw new Error(`${name} resolved, expected it to throw`);
}

const storedField = {
	id: 11,
	cfpFormId: 3,
	label: 'Dietary needs',
	kind: 'short_text' as const,
	required: false,
	position: 0,
	options: null,
	conditionSource: null,
	conditionFieldId: null,
	conditionValue: null
};

const storedForm = {
	id: 3,
	conferenceId: 7,
	title: 'Call for papers',
	description: 'Talks wanted.',
	opensAt: null,
	closesAt: null,
	hiddenFixedFields: null,
	speakerSupport: null,
	status: 'draft' as const,
	createdAt: new Date('2026-08-16T00:00:00.000Z')
};

beforeEach(() => {
	organizerConference.mockReset();
	cfpFormView.mockReset();
	updateCfpForm.mockReset();
	addField.mockReset();
	updateField.mockReset();
	deleteField.mockReset();
	moveField.mockReset();
	setFixedQuestionShown.mockReset();
	organizerConference.mockResolvedValue(conference);
});

describe('the form-builder tools', () => {
	it('are the seven the spec names, with writes only on the mutations', () => {
		const byName = Object.fromEntries(cfpFormTools(ctx).map((entry) => [entry.name, entry.writes]));
		expect(byName).toEqual({
			get_cfp_form: false,
			update_cfp_form: true,
			add_cfp_field: true,
			update_cfp_field: true,
			delete_cfp_field: true,
			move_cfp_field: true,
			set_cfp_fixed_question: true
		});
	});
});

describe('get_cfp_form', () => {
	it('returns the builder load, including a missing form', async () => {
		cfpFormView.mockResolvedValue({ form: null, fields: [], tracks: [], formats: [] });

		await expect(tool('get_cfp_form').handler({ conferenceSlug: 'devflow' })).resolves.toEqual({
			conference: { slug: 'devflow', name: 'DevFlow' },
			form: null,
			fields: [],
			tracks: [],
			formats: []
		});
		expect(cfpFormView).toHaveBeenCalledWith(7);
	});

	it('parses speakerSupport instead of handing out the stored column', async () => {
		cfpFormView.mockResolvedValue({
			form: {
				...storedForm,
				speakerSupport: '{"admission":"free","travel":{"kind":"covered"}}'
			},
			fields: [],
			tracks: [],
			formats: []
		});

		const result = await tool('get_cfp_form').handler({ conferenceSlug: 'devflow' });
		expect(result).toMatchObject({
			form: { speakerSupport: { admission: 'free', travel: { kind: 'covered' } } }
		});
	});
});

describe('update_cfp_form', () => {
	it('forwards the merged meta to updateCfpForm', async () => {
		cfpFormView.mockResolvedValue({ form: storedForm, fields: [], tracks: [], formats: [] });
		updateCfpForm.mockResolvedValue({ ...storedForm, title: 'DevFlow CFP' });

		const result = await tool('update_cfp_form').handler({
			conferenceSlug: 'devflow',
			title: 'DevFlow CFP'
		});

		expect(updateCfpForm).toHaveBeenCalledWith(7, {
			title: 'DevFlow CFP',
			description: 'Talks wanted.',
			opensAt: null,
			closesAt: null,
			status: 'draft'
		});
		expect(result).toMatchObject({ form: { title: 'DevFlow CFP', status: 'draft' } });
	});

	it('refuses a conference with no form the same way the screen does', async () => {
		cfpFormView.mockResolvedValue({ form: null, fields: [], tracks: [], formats: [] });

		await expect(
			reject('update_cfp_form', { conferenceSlug: 'devflow', title: 'X' })
		).resolves.toMatchObject({
			message: 'This conference has no call for papers yet.'
		});
		expect(updateCfpForm).not.toHaveBeenCalled();
	});
});

describe('add_cfp_field', () => {
	it('calls addField with the builder FieldInput', async () => {
		addField.mockResolvedValue({ ok: true, field: storedField });

		const result = await tool('add_cfp_field').handler({
			conferenceSlug: 'devflow',
			label: 'Dietary needs',
			kind: 'short_text'
		});

		expect(addField).toHaveBeenCalledWith(7, {
			label: 'Dietary needs',
			kind: 'short_text',
			required: false,
			optionsText: '',
			conditionSource: null,
			conditionFieldId: null,
			conditionValue: null
		});
		expect(result).toMatchObject({ field: { id: 11, label: 'Dietary needs' } });
	});

	it("returns addField's message — the same sentence the form action shows", async () => {
		const input = {
			label: '',
			kind: 'select' as const,
			options: [] as string[]
		};
		const message = validateDefinition({
			label: input.label,
			kind: input.kind,
			options: input.options,
			conditionSource: null,
			conditionFieldId: null,
			conditionValue: null
		});
		addField.mockResolvedValue({ ok: false, message });

		const error = await reject('add_cfp_field', {
			conferenceSlug: 'devflow',
			...input
		});
		expect(error.message).toBe(message);
		expect(error.message).toBe('Give the field a label — it is what the submitter reads.');
	});
});

describe('update_cfp_field', () => {
	it('calls updateField with the field id from get_cfp_form', async () => {
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});
		updateField.mockResolvedValue({ ok: true, field: { ...storedField, label: 'Allergies' } });

		await tool('update_cfp_field').handler({
			conferenceSlug: 'devflow',
			fieldId: 11,
			label: 'Allergies',
			kind: 'short_text'
		});

		expect(updateField).toHaveBeenCalledWith(
			7,
			11,
			expect.objectContaining({ label: 'Allergies', kind: 'short_text' })
		);
	});

	it('fills omitted keys from the stored field, so a rename keeps required and the condition', async () => {
		const stored = {
			...storedField,
			required: true,
			options: '["Yes","No"]',
			conditionSource: 'track' as const,
			conditionFieldId: null,
			conditionValue: '42'
		};
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [stored],
			tracks: [],
			formats: []
		});
		updateField.mockResolvedValue({ ok: true, field: { ...stored, label: 'Allergies' } });

		await tool('update_cfp_field').handler({
			conferenceSlug: 'devflow',
			fieldId: 11,
			label: 'Allergies'
		});

		expect(updateField).toHaveBeenCalledWith(7, 11, {
			label: 'Allergies',
			kind: 'short_text',
			required: true,
			optionsText: 'Yes\nNo',
			conditionSource: 'track',
			conditionFieldId: null,
			conditionValue: '42'
		});
	});

	it('refuses a conference with no form the same way the other tools do', async () => {
		cfpFormView.mockResolvedValue({ form: null, fields: [], tracks: [], formats: [] });

		await expect(
			reject('update_cfp_field', {
				conferenceSlug: 'devflow',
				fieldId: 11,
				label: 'Allergies'
			})
		).resolves.toMatchObject({ message: 'This conference has no call for papers yet.' });
		expect(updateField).not.toHaveBeenCalled();
	});

	it("uses the screen's sentence when the field is not on this form", async () => {
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});

		await expect(
			reject('update_cfp_field', {
				conferenceSlug: 'devflow',
				fieldId: 99,
				label: 'Gone'
			})
		).resolves.toMatchObject({ message: 'That field is not on this form.' });
		expect(updateField).not.toHaveBeenCalled();
	});

	it("surfaces updateField's refusal unchanged", async () => {
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});
		updateField.mockResolvedValue({
			ok: false,
			message: 'Give the field a label — it is what the submitter reads.'
		});

		await expect(
			reject('update_cfp_field', {
				conferenceSlug: 'devflow',
				fieldId: 11,
				label: ''
			})
		).resolves.toMatchObject({
			message: 'Give the field a label — it is what the submitter reads.'
		});
	});
});

describe('delete_cfp_field', () => {
	it('calls deleteField and names the id it removed', async () => {
		deleteField.mockResolvedValue(true);

		await expect(
			tool('delete_cfp_field').handler({ conferenceSlug: 'devflow', fieldId: 11 })
		).resolves.toEqual({
			conference: { slug: 'devflow', name: 'DevFlow' },
			deletedFieldId: 11
		});
		expect(deleteField).toHaveBeenCalledWith(7, 11);
	});

	it("uses the screen's sentence when the field is not on this form", async () => {
		deleteField.mockResolvedValue(false);

		await expect(
			reject('delete_cfp_field', { conferenceSlug: 'devflow', fieldId: 99 })
		).resolves.toMatchObject({ message: 'That field is not on this form.' });
	});
});

describe('move_cfp_field', () => {
	it('calls moveField then reloads the builder list', async () => {
		moveField.mockResolvedValue(true);
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});

		const result = await tool('move_cfp_field').handler({
			conferenceSlug: 'devflow',
			fieldId: 11,
			direction: 'up'
		});

		expect(moveField).toHaveBeenCalledWith(7, 11, 'up');
		expect(cfpFormView).toHaveBeenCalledWith(7);
		expect(result).toMatchObject({ fields: [{ id: 11, label: 'Dietary needs' }] });
	});

	it('refuses a conference with no form the same way the other tools do', async () => {
		cfpFormView.mockResolvedValue({ form: null, fields: [], tracks: [], formats: [] });

		await expect(
			reject('move_cfp_field', { conferenceSlug: 'devflow', fieldId: 11, direction: 'up' })
		).resolves.toMatchObject({ message: 'This conference has no call for papers yet.' });
		expect(moveField).not.toHaveBeenCalled();
	});

	it("uses the screen's sentence when the field is not on this form", async () => {
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});

		await expect(
			reject('move_cfp_field', { conferenceSlug: 'devflow', fieldId: 99, direction: 'up' })
		).resolves.toMatchObject({ message: 'That field is not on this form.' });
		expect(moveField).not.toHaveBeenCalled();
	});

	it("uses the screen's sentence at either end of the list", async () => {
		moveField.mockResolvedValue(false);
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [storedField],
			tracks: [],
			formats: []
		});

		await expect(
			reject('move_cfp_field', { conferenceSlug: 'devflow', fieldId: 11, direction: 'up' })
		).resolves.toMatchObject({ message: 'That field cannot move any further.' });
	});
});

describe('set_cfp_fixed_question', () => {
	it('calls setFixedQuestionShown then returns the rebuilt form', async () => {
		setFixedQuestionShown.mockResolvedValue(true);
		cfpFormView.mockResolvedValue({
			form: { ...storedForm, hiddenFixedFields: '["abstract"]' },
			fields: [],
			tracks: [],
			formats: []
		});

		const result = await tool('set_cfp_fixed_question').handler({
			conferenceSlug: 'devflow',
			key: 'abstract',
			shown: false
		});

		expect(setFixedQuestionShown).toHaveBeenCalledWith(7, 'abstract', false);
		expect(result).toMatchObject({
			key: 'abstract',
			shown: false,
			form: { hiddenFixedQuestions: ['abstract'] }
		});
	});

	it('refuses a conference with no form the same way the other tools do', async () => {
		cfpFormView.mockResolvedValue({ form: null, fields: [], tracks: [], formats: [] });

		await expect(
			reject('set_cfp_fixed_question', {
				conferenceSlug: 'devflow',
				key: 'abstract',
				shown: false
			})
		).resolves.toMatchObject({ message: 'This conference has no call for papers yet.' });
		expect(setFixedQuestionShown).not.toHaveBeenCalled();
	});

	it("uses the screen's sentence for a question nobody may hide", async () => {
		setFixedQuestionShown.mockResolvedValue(false);
		cfpFormView.mockResolvedValue({
			form: storedForm,
			fields: [],
			tracks: [],
			formats: []
		});

		await expect(
			reject('set_cfp_fixed_question', {
				conferenceSlug: 'devflow',
				key: 'title',
				shown: false
			})
		).resolves.toMatchObject({ message: 'That question cannot be changed.' });
	});
});
