/**
 * Conference settings: rooms, tracks, session formats (#63).
 *
 * Reviewer visibility moved to Team & reviewers (`/people`). Conference days are
 * owned by #86 (derive from start/end) — not created here.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { addFormat, addRoom, addTrack, conferenceConfig } from '$lib/server/conference/config';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	return { config: await conferenceConfig(conference.id) };
};

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

export const actions: Actions = {
	addRoom: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		if ((await addRoom(conference.id, text(await request.formData(), 'name'))) === null) {
			return fail(400, { message: 'Give the room a name.' });
		}
		return { message: 'Room added.' };
	},

	addTrack: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		if ((await addTrack(conference.id, text(await request.formData(), 'name'))) === null) {
			return fail(400, { message: 'Give the track a name.' });
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
			return fail(400, { message: 'Minutes must be a whole number.' });
		}
		if ((await addFormat(conference.id, name, minutes)) === null) {
			return fail(400, {
				message: 'Give the format a name, and minutes between 1 and 1440 if set.'
			});
		}
		return { message: 'Session format added.' };
	}
};
