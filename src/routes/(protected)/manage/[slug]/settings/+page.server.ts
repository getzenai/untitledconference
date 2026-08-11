/**
 * Conference settings: dates, rooms, tracks, session formats (#63, #86).
 *
 * Reviewer visibility lives under Team & reviewers (`/people`). Conference days
 * are not listed here either — they are derived from the date range below (#86),
 * because an organizer who states when the event runs has already said which days
 * it has.
 */
import { invalidRangeField, MAX_CONFERENCE_DAYS } from '$lib/conference/conference-dates';
import { requireOrganizer } from '$lib/server/conference/access';
import { syncConferenceDays } from '$lib/server/conference/conference-days';
import { addFormat, addRoom, addTrack, conferenceConfig } from '$lib/server/conference/config';
import {
	addTaskTemplate,
	deleteTaskTemplate,
	taskTemplates,
	updateTaskTemplate,
	type TemplateInput
} from '$lib/server/conference/task-templates';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const [config, templates] = await Promise.all([
		conferenceConfig(conference.id),
		taskTemplates(conference.id)
	]);
	return { config, templates };
};

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

/** A trimmed field, or null when the organizer cleared it. */
function optional(form: FormData, key: string): string | null {
	return text(form, key).trim() || null;
}

/** The row a template form is talking about, or null if it is not a row id. */
function identifier(form: FormData): number | null {
	const id = Number(form.get('id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The two due fields as the form sends them: empty is "not set", never zero.
 *
 * `Number('')` is 0, and a zero offset is a real value — "due on the day it is
 * accepted". Reading the blank field as a number would silently make that the
 * default for every task nobody gave a deadline.
 */
function templateInput(form: FormData): TemplateInput {
	const offset = optional(form, 'dueOffsetDays');
	return {
		title: text(form, 'title'),
		instructions: optional(form, 'instructions'),
		kind: text(form, 'kind'),
		dueOffsetDays: offset === null ? null : Number(offset),
		dueOn: optional(form, 'dueOn')
	};
}

const DATE_ERRORS = {
	startsOn: 'That start date is not a real date.',
	endsOn: `Check the end date — it must be a real date, on or after the start, and within ${MAX_CONFERENCE_DAYS} days of it.`
} as const;

/** What changed, in the organizer's words rather than in row counts. */
function daysChangedMessage(added: number, removed: number, keptInUse: string[]): string {
	const parts: string[] = [];
	if (added > 0) parts.push(`added ${added} ${added === 1 ? 'day' : 'days'}`);
	if (removed > 0) parts.push(`removed ${removed} empty ${removed === 1 ? 'day' : 'days'}`);

	const head = parts.length > 0 ? `Dates saved — ${parts.join(' and ')}.` : 'Dates saved.';

	// Naming the days is the whole point: "some days were kept" leaves the
	// organizer hunting for which ones still hold sessions.
	if (keptInUse.length === 0) return head;

	return `${head} These days are now outside the range but still hold sessions, so they were kept: ${keptInUse.join(', ')}. Move or remove those sessions, then save again.`;
}

export const actions: Actions = {
	/**
	 * Draft or live — the switch the whole public half of the product hangs on.
	 *
	 * `conference.status` had no writer anywhere in the app: `create-conference`
	 * inserts without it, so every conference an organizer made stayed `draft`
	 * forever, and `draft` is what the public site, the front-door directory and the
	 * public CFP form all filter out. Every conference built through the product was
	 * therefore invisible to visitors and closed to speakers, permanently. Only the
	 * seeded demo conference was ever published, and only because the seed script
	 * writes the column directly.
	 *
	 * The form sends the state it wants rather than "toggle": a stale tab would
	 * otherwise flip the conference the wrong way, and asking for the state you can
	 * see is idempotent by construction.
	 *
	 * Nothing gates publishing — no rooms, no days, no accepted talks. Publishing is
	 * what opens the call for papers, so requiring a programme first would be the
	 * wrong way round.
	 */
	visibility: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const wantsPublished = text(await request.formData(), 'published') === 'true';
		const next = wantsPublished ? 'published' : 'draft';

		if (conference.status === next) {
			return { message: wantsPublished ? 'Already published.' : 'Already a draft.' };
		}

		await db
			.update(conferenceTable)
			.set({ status: next })
			.where(eq(conferenceTable.id, conference.id));

		return {
			message: wantsPublished
				? `Published. /c/${conference.slug} is live and the call for papers can take submissions.`
				: 'Back to draft. The public site and the public submission form answer 404 again.'
		};
	},

	/**
	 * The date range — and, derived from it, the days the agenda grid stands on.
	 *
	 * The organizer states the range; they never enumerate days. Two sources for
	 * one fact drift the moment the event moves by a week.
	 */
	dates: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const startsOn = optional(form, 'startsOn');
		const endsOn = optional(form, 'endsOn');

		const badField = invalidRangeField(startsOn, endsOn);
		if (badField) return fail(400, { error: DATE_ERRORS[badField] });

		// One transaction: the range and the days it implies are one fact, and a
		// stored range whose days never followed is exactly the bug being fixed.
		const sync = await db.transaction(async (tx) => {
			await tx
				.update(conferenceTable)
				.set({ startsOn, endsOn })
				.where(eq(conferenceTable.id, conference.id));

			return syncConferenceDays(conference.id, startsOn, endsOn, tx);
		});

		return {
			message: daysChangedMessage(sync.added.length, sync.removed.length, sync.keptInUse)
		};
	},

	addRoom: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		if ((await addRoom(conference.id, text(await request.formData(), 'name'))) === null) {
			return fail(400, { error: 'Give the room a name.' });
		}
		return { message: 'Room added.' };
	},

	addTrack: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		if ((await addTrack(conference.id, text(await request.formData(), 'name'))) === null) {
			return fail(400, { error: 'Give the track a name.' });
		}
		return { message: 'Track added.' };
	},

	addFormat: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const name = text(form, 'name');
		const rawMinutes = String(form.get('minutes') ?? '').trim();
		const minutes = rawMinutes === '' ? null : Number(rawMinutes);

		if (minutes !== null && !Number.isInteger(minutes)) {
			return fail(400, { error: 'Minutes must be a whole number.' });
		}
		if ((await addFormat(conference.id, name, minutes)) === null) {
			return fail(400, {
				error: 'Give the format a name, and minutes between 1 and 1440 if set.'
			});
		}
		return { message: 'Session format added.' };
	},

	addTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const problem = await addTaskTemplate(conference.id, templateInput(await request.formData()));
		if (problem) return fail(400, { error: problem });
		return { message: 'Task added. Every talk accepted from now on gets it.' };
	},

	updateTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = identifier(form);
		if (id === null) return fail(400, { error: 'Unknown task.' });

		const problem = await updateTaskTemplate(conference.id, id, templateInput(form));
		if (problem) return fail(400, { error: problem });
		return { message: 'Task saved. Tasks speakers already have are unchanged.' };
	},

	deleteTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown task.' });

		const problem = await deleteTaskTemplate(conference.id, id);
		if (problem) return fail(400, { error: problem });
		return { message: 'Task removed. Tasks speakers already have stay where they are.' };
	}
};
