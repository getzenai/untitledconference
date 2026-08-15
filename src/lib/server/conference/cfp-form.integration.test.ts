/**
 * The builder writes the contract every later screen reads, so the tests that matter
 * here are the ones about identity and cleanliness: a field id from a request must
 * never reach another conference's form, and a stored field must never carry columns
 * that contradict its own kind.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { formFieldTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	sessionFormatTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	addField,
	cfpFormView,
	createCfpForm,
	deleteField,
	moveField,
	publishCfpForm,
	publishedFormFor,
	updateCfpForm,
	updateField,
	type FieldInput
} from './cfp-form';

const suffix = `cfp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let other: Conference;
let formatId: number;

const input = (over: Partial<FieldInput> = {}): FieldInput => ({
	label: 'Abstract',
	kind: 'long_text',
	required: false,
	optionsText: '',
	conditionSource: null,
	conditionFieldId: null,
	conditionValue: null,
	...over
});

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'CFP Org',
		slug: organizationId,
		createdAt: new Date()
	});
});

/**
 * A fresh pair of conferences per test.
 *
 * The form is one-per-conference by construction, so "start from no form" means
 * starting from a new conference. Dropping it takes the form and its fields with it.
 */
beforeEach(async () => {
	for (const target of [conference, other]) {
		if (target) await db.delete(conferenceTable).where(eq(conferenceTable.id, target.id));
	}

	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: `${suffix}-${stamp}` })
		.returning();
	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other-${stamp}` })
		.returning();

	const [format] = await db
		.insert(sessionFormatTable)
		.values({ conferenceId: conference.id, name: 'Workshop', minutes: 180 })
		.returning();
	formatId = format.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('creating the form', () => {
	it('is not created by looking at the page', async () => {
		const view = await cfpFormView(conference.id);

		expect(view.form).toBeNull();
		expect(view.fields).toEqual([]);
		// The facets a condition can point at are there even before the form exists.
		expect(view.formats.map((f) => f.name)).toEqual(['Workshop']);
	});

	it('creates once and returns the same form on a second click', async () => {
		const first = await createCfpForm(conference.id, 'DevFlow CFP');
		const second = await createCfpForm(conference.id, 'A different title');

		expect(second.id).toBe(first.id);
		expect(second.title).toBe('DevFlow CFP');
	});

	it('after create stays draft until published — the public path stays dark', async () => {
		const created = await createCfpForm(conference.id, 'Fresh CFP');
		expect(created.status).toBe('draft');
		expect(await publishedFormFor(conference.id)).toBeNull();

		await updateCfpForm(conference.id, {
			title: created.title,
			description: '',
			opensAt: null,
			closesAt: null,
			status: 'published'
		});

		const live = await publishedFormFor(conference.id);
		expect(live?.form.status).toBe('published');
		expect(live?.form.id).toBe(created.id);
	});

	it('only exposes a published or closed form to the public loader', async () => {
		await createCfpForm(conference.id, 'DevFlow CFP');
		expect(await publishedFormFor(conference.id)).toBeNull();

		await updateCfpForm(conference.id, {
			title: 'DevFlow CFP',
			description: '',
			opensAt: null,
			closesAt: null,
			status: 'published'
		});

		const published = await publishedFormFor(conference.id);
		expect(published?.form.status).toBe('published');
	});

	it('keeps the organizer’s intro text, and forgets it when the box is emptied', async () => {
		await createCfpForm(conference.id, 'DevFlow CFP');
		const meta = {
			title: 'DevFlow CFP',
			description: '  What we are looking for.\n\n- Reviews are anonymous.  ',
			opensAt: null,
			closesAt: null,
			status: 'published' as const
		};

		const saved = await updateCfpForm(conference.id, meta);
		expect(saved?.description).toBe('What we are looking for.\n\n- Reviews are anonymous.');

		// An emptied box is "say nothing here", not an empty paragraph — the public
		// page decides whether to render the card by testing for content.
		const cleared = await updateCfpForm(conference.id, { ...meta, description: '   ' });
		expect(cleared?.description).toBeNull();
	});

	it('keeps speaker expenses through publish, and forgets them when cleared (#512)', async () => {
		const created = await createCfpForm(conference.id, 'DevFlow CFP');
		const stored = '{"admission":"free"}';

		const saved = await updateCfpForm(conference.id, {
			title: created.title,
			description: '',
			opensAt: null,
			closesAt: null,
			status: 'draft',
			speakerSupport: stored
		});
		expect(saved?.speakerSupport).toBe(stored);

		const published = await publishCfpForm(conference.id);
		expect(published?.speakerSupport).toBe(stored);
		expect(published?.status).toBe('published');

		const cleared = await updateCfpForm(conference.id, {
			title: created.title,
			description: '',
			opensAt: null,
			closesAt: null,
			status: 'published',
			speakerSupport: null
		});
		expect(cleared?.speakerSupport).toBeNull();
	});
});

describe('fields', () => {
	beforeEach(async () => {
		await createCfpForm(conference.id, 'DevFlow CFP');
	});

	it('refuses definitions a submitter could not fill in', async () => {
		expect(await addField(conference.id, input({ label: '  ' }))).toMatchObject({ ok: false });
		expect(await addField(conference.id, input({ kind: 'select', optionsText: '' }))).toMatchObject(
			{ ok: false }
		);
	});

	it('stores options only for a dropdown, and drops them when the kind changes', async () => {
		const added = await addField(
			conference.id,
			input({ label: 'Level', kind: 'select', optionsText: 'Beginner\n\nAdvanced\n' })
		);
		expect(added.ok && added.field.options).toBe('["Beginner","Advanced"]');

		const changed = await updateField(conference.id, added.ok ? added.field.id : 0, {
			...input({ label: 'Level', kind: 'short_text', optionsText: 'Beginner\nAdvanced' })
		});
		// A short-text field that still carries dropdown options is a field whose next
		// reader has to guess which of the two is true.
		expect(changed.ok && changed.field.options).toBeNull();
	});

	it('keeps a field id only for a field-based condition', async () => {
		const parent = await addField(conference.id, input({ label: 'Given before?' }));
		const parentId = parent.ok ? parent.field.id : 0;

		const child = await addField(
			conference.id,
			input({
				label: 'Where?',
				conditionSource: 'session_format',
				conditionFieldId: parentId,
				conditionValue: String(formatId)
			})
		);

		expect(child.ok && child.field.conditionFieldId).toBeNull();
		expect(child.ok && child.field.conditionValue).toBe(String(formatId));
	});

	it('will not let a field depend on itself', async () => {
		const added = await addField(conference.id, input({ label: 'Loop' }));
		const fieldId = added.ok ? added.field.id : 0;

		const result = await updateField(
			conference.id,
			fieldId,
			input({
				label: 'Loop',
				conditionSource: 'field',
				conditionFieldId: fieldId,
				conditionValue: 'x'
			})
		);

		expect(result).toMatchObject({ ok: false });
	});

	/**
	 * `conditionFieldId` is the second field id in the request, and the one the
	 * conference scope is easiest to forget on — it is not the row being written.
	 */
	it('refuses a rule pointing at a field of another conference', async () => {
		await createCfpForm(other.id, 'Neighbour CFP');
		const theirs = await addField(other.id, input({ label: 'Theirs' }));
		const theirId = theirs.ok ? theirs.field.id : 0;

		const result = await addField(
			conference.id,
			input({
				label: 'Mine',
				conditionSource: 'field',
				conditionFieldId: theirId,
				conditionValue: 'x'
			})
		);

		expect(result).toMatchObject({ ok: false });
	});

	it('answers a rule pointing at nothing with a sentence, not a foreign-key error', async () => {
		const result = await addField(
			conference.id,
			input({
				label: 'Mine',
				conditionSource: 'field',
				conditionFieldId: 999999,
				conditionValue: 'x'
			})
		);

		// Unchecked this reaches Postgres and comes back as an unhandled 500.
		expect(result).toMatchObject({ ok: false });
	});

	it('appends new fields after the existing ones and swaps on move', async () => {
		const ids: number[] = [];
		for (const label of ['One', 'Two', 'Three']) {
			const added = await addField(conference.id, input({ label }));
			if (added.ok) ids.push(added.field.id);
		}

		expect((await cfpFormView(conference.id)).fields.map((f) => f.id)).toEqual(ids);

		expect(await moveField(conference.id, ids[2], 'up')).toBe(true);
		expect((await cfpFormView(conference.id)).fields.map((f) => f.id)).toEqual([
			ids[0],
			ids[2],
			ids[1]
		]);

		// The ends do not wrap around — a click that cannot do anything says so.
		expect(await moveField(conference.id, ids[0], 'up')).toBe(false);
	});

	it('reorders correctly even when two fields share a position', async () => {
		const ids: number[] = [];
		for (const label of ['One', 'Two']) {
			const added = await addField(conference.id, input({ label }));
			if (added.ok) ids.push(added.field.id);
		}
		// The state a hand-edit or an import leaves behind.
		const view = await cfpFormView(conference.id);
		await db
			.update(formFieldTable)
			.set({ position: 0 })
			.where(eq(formFieldTable.cfpFormId, view.form!.id));

		expect(await moveField(conference.id, ids[1], 'up')).toBe(true);
		expect((await cfpFormView(conference.id)).fields.map((f) => f.id)).toEqual([ids[1], ids[0]]);
	});
});

describe('scoping', () => {
	it('cannot touch a field that belongs to another conference', async () => {
		await createCfpForm(other.id, 'Neighbour CFP');
		const theirs = await addField(other.id, input({ label: 'Theirs' }));
		const theirId = theirs.ok ? theirs.field.id : 0;

		await createCfpForm(conference.id, 'DevFlow CFP');

		expect(await updateField(conference.id, theirId, input({ label: 'Mine now' }))).toMatchObject({
			ok: false
		});
		expect(await deleteField(conference.id, theirId)).toBe(false);
		expect(await moveField(conference.id, theirId, 'up')).toBe(false);

		const [untouched] = await db
			.select()
			.from(formFieldTable)
			.where(eq(formFieldTable.id, theirId));
		expect(untouched.label).toBe('Theirs');
	});

	it('will not edit a form that does not exist yet', async () => {
		expect(
			await updateCfpForm(conference.id, {
				title: 'x',
				description: '',
				opensAt: null,
				closesAt: null,
				status: 'published'
			})
		).toBeNull();
		expect(await addField(conference.id, input())).toMatchObject({ ok: false });
	});
});
