/**
 * Conference settings: dates, rooms, tracks, session formats (#63, #86).
 *
 * Reviewer visibility lives under Team & reviewers (`/people`). Conference days
 * are not listed here either — they are derived from the date range below (#86),
 * because an organizer who states when the event runs has already said which days
 * it has.
 */
import { MAX_CONFERENCE_DAYS } from '$lib/conference/conference-dates';
import { addedMessage } from '$lib/conference/structure-lines';
import { requireOrganizer } from '$lib/server/conference/access';
import { archiveConference, restoreConference } from '$lib/server/conference/archive-conference';
import {
	addFormats,
	addRooms,
	addTracks,
	conferenceConfig,
	removeFormat,
	removeRoom,
	removeTrack,
	renameRoom,
	renameTrack,
	updateFormat
} from '$lib/server/conference/config';
import {
	addTaskTemplate,
	applyTemplateToAccepted,
	deleteTaskTemplate,
	pendingHandouts,
	taskTemplates,
	updateTaskTemplate,
	type TemplateInput
} from '$lib/server/conference/task-templates';
import { updateConference } from '$lib/server/conference/update-conference';
import { setConferenceVisibility } from '$lib/server/conference/visibility';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference, via } = await requireOrganizer(locals.user!.id, params.slug);
	const [config, templates, pending] = await Promise.all([
		conferenceConfig(conference.id),
		taskTemplates(conference.id),
		pendingHandouts(conference.id)
	]);
	// `?setup=1` is the soft landing from "New conference": this is a draft, and
	// Publish is the switch that makes /c/<slug> exist. Not a forced wizard — a pointer.
	const setup = url.searchParams.get('setup') === '1';
	// Archiving is an org-wide right, not a per-conference one (`archive-conference.ts`),
	// and `via: 'org'` is set by exactly the seat check that function repeats. A scoped
	// organizer sees nothing to press rather than a button that answers "not yours".
	return { config, templates, pending, setup, canArchive: via === 'org' };
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
		const result = await setConferenceVisibility(conference, wantsPublished);

		if (result.status === 'archived') {
			return {
				message:
					'This conference is archived. Restore it first — publishing is not a way out of the archive.',
				section: 'visibility'
			};
		}

		if (!result.changed) {
			return {
				message: wantsPublished ? 'Already published.' : 'Already a draft.',
				section: 'visibility'
			};
		}

		return {
			message: wantsPublished
				? `Published. /c/${conference.slug} is live and the call for papers can take submissions.`
				: 'Back to draft. The public site and the public submission form answer 404 again.',
			section: 'visibility'
		};
	},

	/**
	 * Archive — the product's delete, and until now the only one an organizer could
	 * not reach.
	 *
	 * #329 gave the model `archived` and the tools to get there; over the web there
	 * was no button, so an organizer whose agent archived a conference saw a dead
	 * publish toggle and a message telling them to restore it with nothing to click.
	 *
	 * The confirmation is graded the same way `archive_conference` grades it: a
	 * draft nobody outside the organization can see goes on the seat alone, and a
	 * published conference — whose public address goes dark under everyone holding
	 * the link — asks for the slug to be typed. Asking every time would make it the
	 * thing you type without reading, and then it guards nothing where it mattered.
	 */
	archive: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const confirmSlug = text(await request.formData(), 'confirmSlug').trim();

		if (conference.status === 'published' && confirmSlug !== conference.slug) {
			return fail(400, {
				error: `Type ${conference.slug} to confirm. Archiving takes /c/${conference.slug} offline for everyone holding the link. Nothing was archived.`,
				section: 'visibility'
			});
		}

		const result = await archiveConference(conference, locals.user!.id);

		if (!result.ok) {
			return fail(result.reason === 'not_org_wide' ? 403 : 400, {
				error:
					result.reason === 'not_org_wide'
						? 'Archiving needs an owner or admin seat in this organization. Organizing this one event is not enough.'
						: 'Already archived.',
				section: 'visibility'
			});
		}

		return {
			message: result.wasPublic
				? `Archived. /c/${conference.slug} answers 404 — copies already cached at the edge can still answer for up to a minute. Restore puts it back exactly as it was.`
				: 'Archived. It is out of every list; restore puts it back exactly as it was.',
			section: 'visibility'
		};
	},

	/** The one door back out of the archive — see `visibility.ts` for why publish is not. */
	restore: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await restoreConference(conference, locals.user!.id);

		if (!result.ok) {
			return fail(result.reason === 'not_org_wide' ? 403 : 400, {
				error:
					result.reason === 'not_org_wide'
						? 'Restoring needs an owner or admin seat in this organization. Organizing this one event is not enough.'
						: 'This conference is not archived.',
				section: 'visibility'
			});
		}

		return {
			message:
				result.status === 'published'
					? `Restored, and live again — /c/${conference.slug} is back where it was.`
					: 'Restored as a draft.',
			section: 'visibility'
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
		const result = await updateConference(conference.id, {
			startsOn: optional(form, 'startsOn'),
			endsOn: optional(form, 'endsOn')
		});

		if (!result.ok) {
			if (result.reason === 'invalid' && result.field !== 'name') {
				return fail(400, { error: DATE_ERRORS[result.field], section: 'dates' });
			}
			return fail(400, {
				error: result.reason === 'invalid' ? result.message : DATE_ERRORS.startsOn,
				section: 'dates'
			});
		}

		return {
			message: daysChangedMessage(
				result.days.added.length,
				result.days.removed.length,
				result.days.keptInUse
			),
			section: 'dates'
		};
	},

	addRoom: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await addRooms(conference.id, text(await request.formData(), 'names'));
		if (result.added.length === 0 && result.skipped.length === 0) {
			return fail(400, { error: 'Give the room a name.', section: 'rooms' });
		}
		return { message: addedMessage('room', result.added, result.skipped), section: 'rooms' };
	},

	addTrack: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await addTracks(conference.id, text(await request.formData(), 'names'));
		if (result.added.length === 0 && result.skipped.length === 0) {
			return fail(400, { error: 'Give the track a name.', section: 'tracks' });
		}
		return { message: addedMessage('track', result.added, result.skipped), section: 'tracks' };
	},

	addFormat: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await addFormats(conference.id, text(await request.formData(), 'formats'));

		if ('problem' in result) return fail(400, { error: result.problem, section: 'formats' });
		if (result.added.length === 0 && result.skipped.length === 0) {
			return fail(400, { error: 'Give the format a name.', section: 'formats' });
		}

		return {
			message: addedMessage('session format', result.added, result.skipped),
			section: 'formats'
		};
	},

	/**
	 * Editing and removing what the three lists hold (#119).
	 *
	 * Every one of these takes the row id from the form and hands it straight to a
	 * writer that matches on the conference as well: an id from a browser is never
	 * a claim about which conference it belongs to.
	 *
	 * The success sentences say what did *not* happen as well as what did. A rename
	 * keeps the id, so every scheduled session and every submission follows along —
	 * an organizer who is not told that will go and check.
	 */
	renameRoom: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = identifier(form);
		if (id === null) return fail(400, { error: 'Unknown room.', section: 'rooms' });

		const problem = await renameRoom(conference.id, id, text(form, 'name'));
		if (problem) return fail(400, { error: problem, section: 'rooms' });
		return {
			message: 'Room renamed. Everything scheduled in it stays where it is.',
			section: 'rooms'
		};
	},

	deleteRoom: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown room.', section: 'rooms' });

		const problem = await removeRoom(conference.id, id);
		if (problem) return fail(400, { error: problem, section: 'rooms' });
		return { message: 'Room removed.', section: 'rooms' };
	},

	renameTrack: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = identifier(form);
		if (id === null) return fail(400, { error: 'Unknown track.', section: 'tracks' });

		const problem = await renameTrack(conference.id, id, text(form, 'name'));
		if (problem) return fail(400, { error: problem, section: 'tracks' });
		return {
			message: 'Track renamed. Submissions in it keep it, under the new name.',
			section: 'tracks'
		};
	},

	deleteTrack: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown track.', section: 'tracks' });

		const problem = await removeTrack(conference.id, id);
		if (problem) return fail(400, { error: problem, section: 'tracks' });
		return { message: 'Track removed.', section: 'tracks' };
	},

	/**
	 * Name and length in one submit, because they are one row and an organizer
	 * fixing "Wokrshop" should not have to decide whether the 90 minutes came too.
	 */
	updateFormat: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = identifier(form);
		if (id === null) return fail(400, { error: 'Unknown session format.', section: 'formats' });

		// An empty minutes field is "no length set", not zero — `Number('')` is 0,
		// and a zero-minute format would flatten every agenda end time it touches.
		const minutes = optional(form, 'minutes');
		const problem = await updateFormat(
			conference.id,
			id,
			text(form, 'name'),
			minutes === null ? null : Number(minutes)
		);
		if (problem) return fail(400, { error: problem, section: 'formats' });
		return {
			message: 'Session format saved. Submissions already proposed as it keep it.',
			section: 'formats'
		};
	},

	deleteFormat: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown session format.', section: 'formats' });

		const problem = await removeFormat(conference.id, id);
		if (problem) return fail(400, { error: problem, section: 'formats' });
		return { message: 'Session format removed.', section: 'formats' };
	},

	addTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const problem = await addTaskTemplate(conference.id, templateInput(await request.formData()));
		if (problem) return fail(400, { error: problem, section: 'tasks' });
		return {
			message: 'Task added. Every talk accepted from now on gets it.',
			section: 'tasks'
		};
	},

	/**
	 * The other half of "a template only changes the next acceptance".
	 *
	 * Without this an organizer who adds a deliverable mid-cycle cannot ask for it
	 * at all: every speaker is already accepted, so nothing will ever hand it out.
	 */
	handOutTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown task.', section: 'tasks' });

		const result = await applyTemplateToAccepted(conference.id, id);
		if (!result.ok) return fail(400, { error: result.problem, section: 'tasks' });

		return {
			message:
				result.created === 0
					? 'Every accepted speaker already has that task.'
					: `Task given to ${result.created} accepted ${result.created === 1 ? 'speaker' : 'speakers'}.`,
			section: 'tasks'
		};
	},

	updateTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = identifier(form);
		if (id === null) return fail(400, { error: 'Unknown task.', section: 'tasks' });

		const problem = await updateTaskTemplate(conference.id, id, templateInput(form));
		if (problem) return fail(400, { error: problem, section: 'tasks' });
		return { message: 'Task saved. Tasks speakers already have are unchanged.', section: 'tasks' };
	},

	deleteTemplate: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = identifier(await request.formData());
		if (id === null) return fail(400, { error: 'Unknown task.', section: 'tasks' });

		const problem = await deleteTaskTemplate(conference.id, id);
		if (problem) return fail(400, { error: problem, section: 'tasks' });
		return {
			message: 'Task removed. Tasks speakers already have stay where they are.',
			section: 'tasks'
		};
	}
};
