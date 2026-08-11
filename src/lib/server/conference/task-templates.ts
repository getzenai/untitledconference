/**
 * The task templates an acceptance turns into speaker tasks.
 *
 * The generator has been there all along (`createSpeakerTasks` in `decisions.ts`,
 * Ü7) and the deliverables screen tells organizers that "tasks are created from
 * the templates in settings" — but nothing in the product could write a template.
 * The sentence pointed at a page that had no such section, so the speaker journey
 * ended before it began: no template, no task, an empty portal.
 *
 * Everything here is scoped to one conference in the query itself. A template id
 * arrives from a form, so it is never trusted: every write matches on the
 * conference too, and a row that does not belong answers "not found" rather than
 * being edited.
 */
import { db } from '$lib/server/db';
import { taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { and, asc, eq, sql } from 'drizzle-orm';

export type TaskTemplate = {
	id: number;
	title: string;
	instructions: string | null;
	kind: 'action' | 'file_request';
	dueOffsetDays: number | null;
	dueOn: Date | null;
	position: number;
};

export type TemplateInput = {
	title: string;
	instructions: string | null;
	kind: string;
	/** Days after the acceptance, or null. */
	dueOffsetDays: number | null;
	/** A fixed calendar date (`YYYY-MM-DD`), or null. */
	dueOn: string | null;
};

/** What went wrong, in the words the form prints. `null` means it is fine. */
export type TemplateProblem = string | null;

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 2000;
/** A year of slack. Beyond that it is a typo, not a deadline. */
const MAX_OFFSET_DAYS = 365;

export async function taskTemplates(conferenceId: number): Promise<TaskTemplate[]> {
	return db
		.select({
			id: taskTemplateTable.id,
			title: taskTemplateTable.title,
			instructions: taskTemplateTable.instructions,
			kind: taskTemplateTable.kind,
			dueOffsetDays: taskTemplateTable.dueOffsetDays,
			dueOn: taskTemplateTable.dueOn,
			position: taskTemplateTable.position
		})
		.from(taskTemplateTable)
		.where(eq(taskTemplateTable.conferenceId, conferenceId))
		.orderBy(asc(taskTemplateTable.position), asc(taskTemplateTable.id));
}

/**
 * Validates and normalizes one template.
 *
 * The two due fields are exclusive because the generator already decided between
 * them — `dueDate()` takes the absolute date and ignores the offset. Storing both
 * would mean the form says one thing and the created task shows another, which is
 * worse than refusing to save.
 */
function parse(
	input: TemplateInput
): { ok: true; values: Omit<TaskTemplate, 'id' | 'position'> } | { ok: false; problem: string } {
	const title = input.title.trim().slice(0, MAX_TITLE);
	if (!title) return { ok: false, problem: 'Give the task a title.' };

	if (input.kind !== 'action' && input.kind !== 'file_request') {
		return { ok: false, problem: 'Pick what the speaker has to do.' };
	}

	if (input.dueOffsetDays !== null && input.dueOn !== null) {
		return {
			ok: false,
			problem: 'Set a due date or a number of days after acceptance — not both.'
		};
	}

	if (input.dueOffsetDays !== null) {
		if (!Number.isInteger(input.dueOffsetDays) || input.dueOffsetDays < 0) {
			return { ok: false, problem: 'Days after acceptance must be a whole number, zero or more.' };
		}
		if (input.dueOffsetDays > MAX_OFFSET_DAYS) {
			return { ok: false, problem: `Days after acceptance must be ${MAX_OFFSET_DAYS} or fewer.` };
		}
	}

	let dueOn: Date | null = null;
	if (input.dueOn !== null) {
		// Midday UTC, not midnight: a due date stored at 00:00Z is "the day before"
		// for every organizer west of Greenwich when it is printed back in local time.
		dueOn = new Date(`${input.dueOn}T12:00:00.000Z`);
		if (Number.isNaN(dueOn.getTime()))
			return { ok: false, problem: 'That due date is not a date.' };
	}

	return {
		ok: true,
		values: {
			title,
			instructions: input.instructions?.trim().slice(0, MAX_INSTRUCTIONS) || null,
			kind: input.kind,
			dueOffsetDays: input.dueOffsetDays,
			dueOn
		}
	};
}

export async function addTaskTemplate(
	conferenceId: number,
	input: TemplateInput
): Promise<TemplateProblem> {
	const parsed = parse(input);
	if (!parsed.ok) return parsed.problem;

	const [{ next }] = await db
		.select({ next: sql<number>`coalesce(max(${taskTemplateTable.position}), -1) + 1` })
		.from(taskTemplateTable)
		.where(eq(taskTemplateTable.conferenceId, conferenceId));

	await db.insert(taskTemplateTable).values({ conferenceId, ...parsed.values, position: next });
	return null;
}

/**
 * Editing a template changes what the *next* acceptance creates.
 *
 * Tasks already handed to a speaker are left exactly as they are, and that is the
 * point rather than an omission: a speaker may have uploaded against one, and
 * rewriting the title under them would change a thing they already answered.
 */
export async function updateTaskTemplate(
	conferenceId: number,
	templateId: number,
	input: TemplateInput
): Promise<TemplateProblem> {
	const parsed = parse(input);
	if (!parsed.ok) return parsed.problem;

	const updated = await db
		.update(taskTemplateTable)
		.set(parsed.values)
		.where(
			and(eq(taskTemplateTable.id, templateId), eq(taskTemplateTable.conferenceId, conferenceId))
		)
		.returning({ id: taskTemplateTable.id });

	return updated.length > 0 ? null : 'That template is gone.';
}

/**
 * Removing a template stops it being handed out again. It does not take back the
 * tasks it already created — `task.template_id` is `on delete set null`, so a
 * speaker's open task, and any file already uploaded against it, survive. Deleting
 * a line in settings must never delete somebody's work.
 */
export async function deleteTaskTemplate(
	conferenceId: number,
	templateId: number
): Promise<TemplateProblem> {
	const removed = await db
		.delete(taskTemplateTable)
		.where(
			and(eq(taskTemplateTable.id, templateId), eq(taskTemplateTable.conferenceId, conferenceId))
		)
		.returning({ id: taskTemplateTable.id });

	return removed.length > 0 ? null : 'That template is gone.';
}
