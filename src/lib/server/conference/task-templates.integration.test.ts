/**
 * The templates an acceptance turns into speaker tasks.
 *
 * The generator was never the problem — nothing in the product could write a
 * template, so the deliverables screen's "tasks are created from the templates in
 * settings" pointed at a section that did not exist and every speaker portal
 * stayed empty. These tests cover the writing end, and the last one covers the
 * promise itself: a template made here, a talk accepted, a task in the portal.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable, taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decideSubmissions } from './decisions';
import {
	addTaskTemplate,
	applyTemplateToAccepted,
	deleteTaskTemplate,
	pendingHandouts,
	taskTemplates,
	updateTaskTemplate
} from './task-templates';

const suffix = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let otherConference: Conference;
let speakerProfileId: number;

/** The whole input, so each test names only what it is about. */
const input = (over: Partial<Parameters<typeof addTaskTemplate>[1]> = {}) => ({
	title: 'Upload your slides',
	instructions: null,
	kind: 'file_request',
	dueOffsetDays: null,
	dueOn: null,
	...over
});

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Template Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Another Conf', slug: `${suffix}-other` })
		.returning();

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: `priya-${suffix}@example.com`
		})
		.returning();
	speakerProfileId = speaker.id;
});

beforeEach(async () => {
	await db.delete(taskTemplateTable).where(eq(taskTemplateTable.conferenceId, conference.id));
	await db.delete(taskTemplateTable).where(eq(taskTemplateTable.conferenceId, otherConference.id));
	await db.delete(taskTable).where(eq(taskTable.conferenceId, conference.id));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conference.id));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

/** An accepted-ready submission with our speaker on it. */
async function submission(title = 'Taming 40-minute CI') {
	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId: conference.id, title, status: 'submitted' })
		.returning();
	await db
		.insert(submissionSpeakerTable)
		.values({ submissionId: row.id, speakerProfileId, isPrimary: true, position: 0 });
	return row.id;
}

describe('writing task templates', () => {
	it('keeps them in the order they were added', async () => {
		expect(await addTaskTemplate(conference.id, input({ title: 'First' }))).toBeNull();
		expect(await addTaskTemplate(conference.id, input({ title: 'Second' }))).toBeNull();

		const list = await taskTemplates(conference.id);
		expect(list.map((t) => t.title)).toEqual(['First', 'Second']);
		expect(list.map((t) => t.position)).toEqual([0, 1]);
	});

	it('takes a due date or an offset, and refuses both at once', async () => {
		expect(await addTaskTemplate(conference.id, input({ dueOffsetDays: 14 }))).toBeNull();
		expect(await addTaskTemplate(conference.id, input({ dueOn: '2028-05-01' }))).toBeNull();

		expect(
			await addTaskTemplate(conference.id, input({ dueOffsetDays: 14, dueOn: '2028-05-01' }))
		).toMatch(/not both/);

		expect(await taskTemplates(conference.id)).toHaveLength(2);
	});

	/** Zero is a real offset — "due the day you accept it" — not a missing value. */
	it('accepts a zero offset and rejects a negative one', async () => {
		expect(await addTaskTemplate(conference.id, input({ dueOffsetDays: 0 }))).toBeNull();
		expect((await taskTemplates(conference.id))[0].dueOffsetDays).toBe(0);

		expect(await addTaskTemplate(conference.id, input({ dueOffsetDays: -1 }))).toMatch(/whole/);
	});

	it('refuses a template with no title and one with an invented kind', async () => {
		expect(await addTaskTemplate(conference.id, input({ title: '   ' }))).toMatch(/title/);
		expect(await addTaskTemplate(conference.id, input({ kind: 'interpretive_dance' }))).toMatch(
			/what the speaker/
		);
		expect(await taskTemplates(conference.id)).toEqual([]);
	});

	/**
	 * The date lands at midday UTC on purpose: stored at midnight it prints as the
	 * previous day for anybody west of Greenwich.
	 */
	it('stores a fixed due date inside the day it names', async () => {
		await addTaskTemplate(conference.id, input({ dueOn: '2028-05-01' }));

		const [saved] = await taskTemplates(conference.id);
		expect(saved.dueOn?.toISOString()).toBe('2028-05-01T12:00:00.000Z');
	});
});

describe('editing and removing', () => {
	it('edits a template in place', async () => {
		await addTaskTemplate(conference.id, input({ title: 'Slides' }));
		const [before] = await taskTemplates(conference.id);

		expect(
			await updateTaskTemplate(
				conference.id,
				before.id,
				input({ title: 'Slides, 16:9', kind: 'action', instructions: 'PDF only' })
			)
		).toBeNull();

		const [after] = await taskTemplates(conference.id);
		expect(after).toMatchObject({
			id: before.id,
			title: 'Slides, 16:9',
			kind: 'action',
			instructions: 'PDF only'
		});
	});

	it('refuses to touch a template belonging to another conference', async () => {
		await addTaskTemplate(otherConference.id, input({ title: 'Not yours' }));
		const [foreign] = await taskTemplates(otherConference.id);

		expect(await updateTaskTemplate(conference.id, foreign.id, input({ title: 'Mine now' }))).toBe(
			'That template is gone.'
		);
		expect(await deleteTaskTemplate(conference.id, foreign.id)).toBe('That template is gone.');

		expect((await taskTemplates(otherConference.id))[0].title).toBe('Not yours');
	});

	/**
	 * The one that matters: removing a line in settings must not delete a speaker's
	 * work. `task.template_id` is `on delete set null`, so the task and anything
	 * uploaded against it stay.
	 */
	it('leaves tasks it already created standing when the template goes', async () => {
		await addTaskTemplate(conference.id, input({ title: 'Upload your slides' }));
		const [template] = await taskTemplates(conference.id);
		const id = await submission();

		await decideSubmissions(conference, [id], 'accepted');
		const created = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(created).toHaveLength(1);

		expect(await deleteTaskTemplate(conference.id, template.id)).toBeNull();

		const after = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(after).toHaveLength(1);
		expect(after[0].title).toBe('Upload your slides');
		expect(after[0].templateId).toBeNull();
	});
});

/**
 * The sentence on the deliverables screen, end to end: a template written through
 * settings, a talk accepted, a task waiting for the speaker.
 */
describe('what an acceptance makes of them', () => {
	it('hands the speaker one task per template, with the due dates they carry', async () => {
		await addTaskTemplate(conference.id, input({ title: 'Upload your slides', dueOffsetDays: 0 }));
		await addTaskTemplate(
			conference.id,
			input({ title: 'Confirm your bio', kind: 'action', dueOn: '2028-05-01' })
		);
		const id = await submission();

		const result = await decideSubmissions(conference, [id], 'accepted');
		expect(result).toMatchObject({ decided: 1, tasksCreated: 2 });

		const tasks = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(tasks.map((t) => t.title).sort()).toEqual(['Confirm your bio', 'Upload your slides']);

		const fixed = tasks.find((t) => t.title === 'Confirm your bio');
		expect(fixed?.dueOn?.toISOString()).toBe('2028-05-01T12:00:00.000Z');
		// The zero-offset task is due the day it was accepted, not undated.
		const offset = tasks.find((t) => t.title === 'Upload your slides');
		expect(offset?.dueOn).not.toBeNull();
	});

	it('creates nothing when there are no templates — the state that was the bug', async () => {
		const id = await submission();

		const result = await decideSubmissions(conference, [id], 'accepted');

		expect(result).toMatchObject({ decided: 1, tasksCreated: 0 });
	});
});

/**
 * The gap this closes: a template only ever applied to the *next* acceptance, so
 * an organizer who thought of a deliverable after deciding the programme could
 * not ask for it at all. Re-deciding the talks is not a workaround — it would
 * re-send decision mail.
 */
describe('giving a new task to speakers already accepted', () => {
	it('counts who is missing it, and hands it to exactly them', async () => {
		const id = await submission();
		await decideSubmissions(conference, [id], 'accepted');

		// Written after the acceptance, which is the whole problem.
		await addTaskTemplate(conference.id, input({ title: 'Upload Session Presentation' }));
		const [template] = await taskTemplates(conference.id);

		expect(await pendingHandouts(conference.id)).toEqual({ [template.id]: 1 });

		const result = await applyTemplateToAccepted(conference.id, template.id);
		expect(result).toEqual({ ok: true, created: 1 });

		const tasks = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(tasks.map((t) => t.title)).toEqual(['Upload Session Presentation']);
		expect(tasks[0].speakerProfileId).toBe(speakerProfileId);
		expect(tasks[0].submissionId).toBe(id);
		expect(tasks[0].templateId).toBe(template.id);
	});

	it('is a no-op the second time, so a speaker never gets the same task twice', async () => {
		const id = await submission();
		await decideSubmissions(conference, [id], 'accepted');
		await addTaskTemplate(conference.id, input({ title: 'Upload Session Presentation' }));
		const [template] = await taskTemplates(conference.id);

		await applyTemplateToAccepted(conference.id, template.id);
		// The organizer presses it again, or two of them do at once.
		expect(await applyTemplateToAccepted(conference.id, template.id)).toEqual({
			ok: true,
			created: 0
		});

		const tasks = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(tasks).toHaveLength(1);
		expect(await pendingHandouts(conference.id)).toEqual({ [template.id]: 0 });
	});

	it('leaves a task the acceptance already created alone', async () => {
		await addTaskTemplate(conference.id, input({ title: 'Upload your slides' }));
		const [template] = await taskTemplates(conference.id);
		const id = await submission();
		await decideSubmissions(conference, [id], 'accepted');

		// Nobody is missing it: the acceptance handed it out.
		expect(await pendingHandouts(conference.id)).toEqual({ [template.id]: 0 });
		expect(await applyTemplateToAccepted(conference.id, template.id)).toEqual({
			ok: true,
			created: 0
		});
	});

	it('counts an offset from each speaker’s own acceptance, not from today', async () => {
		const id = await submission();
		await decideSubmissions(conference, [id], 'accepted');

		// Backdate the decision: this speaker was accepted a fortnight ago.
		const decidedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		await db.update(submissionTable).set({ decidedAt }).where(eq(submissionTable.id, id));

		await addTaskTemplate(conference.id, input({ title: 'Send your bio', dueOffsetDays: 7 }));
		const [template] = await taskTemplates(conference.id);
		await applyTemplateToAccepted(conference.id, template.id);

		const [task] = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		// "Due 7 days after acceptance" for someone accepted 14 days ago is already
		// overdue. Counting from now would quietly give them a fresh week.
		expect(task.dueOn!.getTime()).toBeLessThan(Date.now());
		expect(task.dueOn!.getTime()).toBeCloseTo(decidedAt.getTime() + 7 * 24 * 60 * 60 * 1000, -4);
	});

	it('does not reach a speaker whose talk was not accepted', async () => {
		const accepted = await submission('Accepted talk');
		const pending = await submission('Still submitted');
		await decideSubmissions(conference, [accepted], 'accepted');

		await addTaskTemplate(conference.id, input({ title: 'Upload Session Presentation' }));
		const [template] = await taskTemplates(conference.id);

		expect(await pendingHandouts(conference.id)).toEqual({ [template.id]: 1 });
		await applyTemplateToAccepted(conference.id, template.id);

		const tasks = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.conferenceId, conference.id));
		expect(tasks).toHaveLength(1);
		expect(tasks[0].submissionId).toBe(accepted);
		expect(tasks[0].submissionId).not.toBe(pending);
	});

	it('refuses a template from another conference', async () => {
		await addTaskTemplate(otherConference.id, input({ title: 'Not yours' }));
		const [foreign] = await taskTemplates(otherConference.id);

		expect(await applyTemplateToAccepted(conference.id, foreign.id)).toEqual({
			ok: false,
			problem: 'That template is gone.'
		});
	});
});
