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
	placeSession,
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
	}
};
