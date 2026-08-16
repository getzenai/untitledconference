/**
 * Form-builder tools against the isolated harness tenant (#712).
 *
 * The write the tool makes has to be the write the builder screen would have
 * made: the field added through the tool is the field cfpFormView — the page
 * load — returns, and a refused definition is the same sentence addField
 * (the form action) already returns.
 */
import { validateDefinition } from '$lib/conference/form-definition';
import { addField, cfpFormView, createCfpForm } from '$lib/server/conference/cfp-form';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '../harness';
import { registerAllTools } from '../server';

const suffix = `mcpcfp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	registerAllTools(
		{
			registerTool(name: string, _config: unknown, callback: Handler) {
				handlers.set(name, callback);
			}
		} as never,
		ctx
	);
	return handlers;
}

async function call(ctx: McpContext, name: string, args: Record<string, unknown> = {}) {
	const handler = toolsFor(ctx).get(name);
	if (!handler) throw new Error(`tool ${name} was not registered`);
	const result = (await handler(args)) as unknown as {
		isError?: boolean;
		content: { text: string }[];
	};
	return {
		isError: result.isError ?? false,
		text: result.content[0].text,
		data: result.isError ? null : JSON.parse(result.content[0].text)
	};
}

let seeded: SeededHarness;
let organizer: McpContext;
let slug: string;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	slug = seeded.conferenceSlug;
	await createCfpForm(seeded.conferenceId, `${seeded.conferenceSlug} — Call for papers`);
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('form-builder tools against the screen', () => {
	it('adds a field through the tool that the builder load then finds', async () => {
		const added = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: 'Recording consent',
			kind: 'boolean',
			required: true
		});

		expect(added.isError).toBe(false);
		expect(added.data).toMatchObject({
			field: { label: 'Recording consent', kind: 'boolean', required: true }
		});
		const fieldId = added.data?.field.id as number;

		const view = await cfpFormView(seeded.conferenceId);
		expect(view.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: fieldId,
					label: 'Recording consent',
					kind: 'boolean',
					required: true
				})
			])
		);

		const read = await call(organizer, 'get_cfp_form', { conferenceSlug: slug });
		expect(read.data?.fields).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: fieldId, label: 'Recording consent' })])
		);
	});

	it('refuses an invalid definition with the same sentence the form action uses', async () => {
		const input = {
			label: '',
			kind: 'select' as const,
			required: false,
			optionsText: '',
			conditionSource: null,
			conditionFieldId: null,
			conditionValue: null
		};
		const domain = await addField(seeded.conferenceId, input);
		const expected = validateDefinition({
			label: input.label,
			kind: input.kind,
			options: [],
			conditionSource: null,
			conditionFieldId: null,
			conditionValue: null
		});

		expect(domain).toMatchObject({ ok: false, message: expected });

		const tool = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: '',
			kind: 'select',
			options: []
		});

		expect(tool.isError).toBe(true);
		expect(tool.text).toBe(expected);
		expect(domain.ok).toBe(false);
		if (!domain.ok) expect(tool.text).toBe(domain.message);
	});

	it('updates the form meta through updateCfpForm', async () => {
		const updated = await call(organizer, 'update_cfp_form', {
			conferenceSlug: slug,
			title: 'Harness CFP',
			description: 'Proposals for the playground.'
		});

		expect(updated.isError).toBe(false);
		expect(updated.data).toMatchObject({
			form: { title: 'Harness CFP', description: 'Proposals for the playground.' }
		});

		const view = await cfpFormView(seeded.conferenceId);
		expect(view.form?.title).toBe('Harness CFP');
		expect(view.form?.description).toBe('Proposals for the playground.');
	});

	it('keeps required and the condition when update_cfp_field is only asked to rename', async () => {
		const parent = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: 'Needs a visa',
			kind: 'boolean',
			required: true
		});
		const parentId = parent.data?.field.id as number;

		const child = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: 'Which country',
			kind: 'short_text',
			required: true,
			conditionSource: 'field',
			conditionFieldId: parentId,
			conditionValue: 'true'
		});
		const childId = child.data?.field.id as number;
		expect(child.isError).toBe(false);

		const saved = await call(organizer, 'update_cfp_field', {
			conferenceSlug: slug,
			fieldId: childId,
			label: 'Passport country'
		});
		expect(saved.isError).toBe(false);
		expect(saved.data).toMatchObject({
			field: {
				id: childId,
				label: 'Passport country',
				kind: 'short_text',
				required: true,
				conditionSource: 'field',
				conditionFieldId: parentId,
				conditionValue: 'true'
			}
		});

		const view = await cfpFormView(seeded.conferenceId);
		expect(view.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: childId,
					label: 'Passport country',
					required: true,
					conditionSource: 'field',
					conditionFieldId: parentId,
					conditionValue: 'true'
				})
			])
		);
	});

	it('moves, updates, hides a fixed question and deletes through the same functions', async () => {
		const first = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: 'First extra',
			kind: 'short_text'
		});
		const second = await call(organizer, 'add_cfp_field', {
			conferenceSlug: slug,
			label: 'Second extra',
			kind: 'short_text'
		});
		const firstId = first.data?.field.id as number;
		const secondId = second.data?.field.id as number;

		const moved = await call(organizer, 'move_cfp_field', {
			conferenceSlug: slug,
			fieldId: secondId,
			direction: 'up'
		});
		expect(moved.isError).toBe(false);
		const labels = (moved.data?.fields as { id: number; label: string }[]).map(
			(field) => field.label
		);
		expect(labels.indexOf('Second extra')).toBeLessThan(labels.indexOf('First extra'));

		const saved = await call(organizer, 'update_cfp_field', {
			conferenceSlug: slug,
			fieldId: firstId,
			label: 'First extra, edited'
		});
		expect(saved.isError).toBe(false);
		expect(saved.data).toMatchObject({ field: { id: firstId, label: 'First extra, edited' } });

		const hidden = await call(organizer, 'set_cfp_fixed_question', {
			conferenceSlug: slug,
			key: 'abstract',
			shown: false
		});
		expect(hidden.isError).toBe(false);
		expect(hidden.data).toMatchObject({
			key: 'abstract',
			shown: false,
			form: { hiddenFixedQuestions: ['abstract'] }
		});

		const removed = await call(organizer, 'delete_cfp_field', {
			conferenceSlug: slug,
			fieldId: secondId
		});
		expect(removed.isError).toBe(false);

		const view = await cfpFormView(seeded.conferenceId);
		expect(view.fields.map((field) => field.id)).toContain(firstId);
		expect(view.fields.map((field) => field.id)).not.toContain(secondId);
		expect(view.form?.hiddenFixedFields).toContain('abstract');
	});
});
