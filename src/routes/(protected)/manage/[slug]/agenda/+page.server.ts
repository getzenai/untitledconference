/**
 * The agenda builder (AIA-01..08).
 *
 * Every action re-derives the conference from the slug through `requireOrganizer` and
 * hands that id to the agenda module, which puts it in the WHERE clause. Nothing here
 * trusts a placement id from the form to belong to this conference — that is the one
 * check a scheduling screen cannot afford to do in the caller.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import {
	agendaBoard,
	autoPlace,
	backfillTray,
	createBlock,
	placeSession,
	removeBlock,
	setAgendaPublished,
	setPlacementStatus,
	slotOptions,
	swapPlacements,
	unplaceSession
} from '$lib/server/conference/agenda';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	// An accepted talk decided before this screen existed has no placement row and
	// would be invisible here — not unscheduled, simply absent. Cheap and idempotent.
	await backfillTray(conference.id);

	return {
		conference,
		board: await agendaBoard(conference.id),
		slots: slotOptions()
	};
};

function id(value: FormDataEntryValue | null): number | null {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The break or hold a form is asking for, or the sentence to hand back (#450).
 *
 * Reading the form is its own job so the action stays a sequence of writes. The
 * empty room option is "every room", which is what a lunch break is — it has to
 * stay distinguishable from a room id that was sent and means nothing.
 */
function heldSlotFrom(form: FormData): { error: string } | Parameters<typeof createBlock>[1] {
	const dayId = id(form.get('dayId'));
	const startMinutes = Number(form.get('startMinutes'));
	const minutes = Number(form.get('minutes'));

	if (!dayId || !Number.isInteger(startMinutes) || !Number.isInteger(minutes)) {
		return { error: 'Pick a day, a time and a length.' };
	}

	const roomValue = form.get('roomId');
	const everyRoom = roomValue === '' || roomValue === null;
	const roomId = everyRoom ? null : id(roomValue);
	if (!everyRoom && roomId === null) return { error: 'No such room.' };

	return {
		dayId,
		roomId,
		startMinutes,
		minutes,
		title: String(form.get('title') ?? ''),
		kind: form.get('kind') === 'reservation' ? 'reservation' : 'block'
	};
}

export const actions: Actions = {
	place: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const placementId = id(form.get('placementId'));
		const dayId = id(form.get('dayId'));
		const roomId = id(form.get('roomId'));
		const startMinutes = Number(form.get('startMinutes'));

		if (!placementId || !dayId || !roomId || !Number.isInteger(startMinutes)) {
			return fail(400, { error: 'Pick a day, a time and a room.' });
		}

		const result = await placeSession(conference.id, placementId, {
			dayId,
			roomId,
			startMinutes
		});
		if (!result.ok) return fail(400, { error: result.reason });

		return { placed: true };
	},

	/**
	 * A third write path, and it earns its place rather than duplicating `place`.
	 *
	 * Everything else here moves one row. This one moves two, and the whole point is
	 * that it moves them together — expressing it as two `?/place` posts would put a
	 * session in the tray between the requests, where an abandoned form leaves it.
	 */
	swap: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const placementId = id(form.get('placementId'));
		const withPlacementId = id(form.get('withPlacementId'));
		if (!placementId || !withPlacementId) {
			return fail(400, { error: 'Pick the session to swap with.' });
		}

		const result = await swapPlacements(conference.id, placementId, withPlacementId);
		if (!result.ok) return fail(400, { error: result.reason });

		return { swapped: true };
	},

	unplace: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const placementId = id((await request.formData()).get('placementId'));
		if (!placementId) return fail(400, { error: 'Unknown session.' });

		if (!(await unplaceSession(conference.id, placementId))) {
			return fail(404, { error: 'No such session.' });
		}
		return { unplaced: true };
	},

	publish: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const published = (await request.formData()).get('published') === 'true';

		const changed = await setAgendaPublished(conference.id, published);
		return { published, changed };
	},

	toggleOne: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const placementId = id(form.get('placementId'));
		const status = form.get('status') === 'confirmed' ? 'confirmed' : 'tentative';

		if (!placementId) return fail(400, { error: 'Unknown session.' });
		if (!(await setPlacementStatus(conference.id, placementId, status))) {
			return fail(404, { error: 'No such session.' });
		}
		return { toggled: true };
	},

	autoPlace: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		return { autoPlaced: await autoPlace(conference.id) };
	},

	/**
	 * A break or a sponsor hold on the grid (#450).
	 *
	 * `createBlock` has existed since the agenda did, but only the in-app agent
	 * could reach it — an organizer building a programme by hand had no way to put
	 * lunch on the day, let alone the sponsor slots they sold before the call for
	 * papers opened. The committee is deciding blind until those slots are on the
	 * grid: of 55 slots, 11 belong to sponsors, and nothing anywhere said so. The
	 * decision screen names those 11 and does not subtract them — what the
	 * organizer typed as capacity may or may not already allow for them, and
	 * guessing which is worse than saying it out loud.
	 */
	hold: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const asked = heldSlotFrom(await request.formData());
		if ('error' in asked) return fail(400, { error: asked.error });

		const result = await createBlock(conference.id, asked);
		if (!result.ok) return fail(400, { error: result.reason });

		return { held: true };
	},

	/**
	 * Takes a break or a hold back off the grid.
	 *
	 * This is also the backfill from the issue: releasing an unsold sponsor hold is
	 * how its slot goes back to the programme, and it is a deliberate click rather
	 * than a quiet edit. `removeBlock` refuses sessions, so a talk cannot leave the
	 * grid through this door.
	 */
	release: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const placementId = id((await request.formData()).get('placementId'));
		if (!placementId) return fail(400, { error: 'Unknown slot.' });

		if (!(await removeBlock(conference.id, placementId))) {
			return fail(404, { error: 'No such break or hold.' });
		}
		return { released: true };
	}
};
