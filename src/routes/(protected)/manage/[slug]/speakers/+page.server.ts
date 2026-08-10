/**
 * Organizer speaker roster (SPK-01 / SPK-02 / SPK-04).
 *
 * Filters live in the URL so a search is shareable and survives a reload.
 * Writes go through the speakers module, which owns org-scoping.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addSpeakerToConference,
	isSpeakerStatus,
	listConferenceSpeakers,
	SPEAKER_STATUSES,
	speakerRosterTotals,
	updateSpeakerProfile,
	updateSpeakerStatus,
	type SpeakerRosterFilters,
	type SpeakerStatus
} from '$lib/server/conference/speakers';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function parseFilters(url: URL): SpeakerRosterFilters {
	const q = url.searchParams.get('q')?.trim() || undefined;
	const rawStatus = url.searchParams.get('status')?.trim() || '';
	const status: SpeakerStatus | undefined = isSpeakerStatus(rawStatus) ? rawStatus : undefined;
	return { q, status };
}

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

function optionalText(form: FormData, key: string): string | null {
	const value = String(form.get(key) ?? '').trim();
	return value === '' ? null : value;
}

function profileId(form: FormData): number {
	const id = Number(form.get('speakerProfileId'));
	return Number.isInteger(id) && id > 0 ? id : 0;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const filters = parseFilters(url);

	const [speakers, counts] = await Promise.all([
		listConferenceSpeakers(conference.id, filters),
		speakerRosterTotals(conference.id)
	]);

	return {
		speakers,
		filters,
		counts,
		statuses: SPEAKER_STATUSES
	};
};

export const actions: Actions = {
	add: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const statusRaw = text(form, 'status').trim();
		const status = isSpeakerStatus(statusRaw) ? statusRaw : 'invited';

		const result = await addSpeakerToConference(conference, {
			name: text(form, 'name'),
			email: optionalText(form, 'email'),
			jobTitle: optionalText(form, 'jobTitle'),
			company: optionalText(form, 'company'),
			bio: optionalText(form, 'bio'),
			sortName: optionalText(form, 'sortName'),
			notes: optionalText(form, 'notes'),
			status
		});

		if (!result.ok) {
			if (result.reason === 'already_on_roster') {
				return fail(400, { error: 'That speaker is already on this conference roster.' });
			}
			if (result.reason === 'invalid') {
				return fail(400, { error: result.message });
			}
			return fail(400, { error: 'Could not add the speaker.' });
		}

		return { message: 'Speaker added to the roster.' };
	},

	updateProfile: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = profileId(form);

		const result = await updateSpeakerProfile(conference.id, id, {
			name: text(form, 'name'),
			email: optionalText(form, 'email'),
			jobTitle: optionalText(form, 'jobTitle'),
			company: optionalText(form, 'company'),
			bio: optionalText(form, 'bio'),
			sortName: optionalText(form, 'sortName'),
			notes: optionalText(form, 'notes')
		});

		if (!result.ok) {
			if (result.reason === 'not_found') {
				return fail(404, { error: 'Speaker is not on this conference roster.' });
			}
			if (result.reason === 'invalid') {
				return fail(400, { error: result.message });
			}
			return fail(400, { error: 'Could not save the profile.' });
		}

		return { message: 'Speaker profile saved.' };
	},

	setStatus: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = profileId(form);
		const status = text(form, 'status').trim();

		const result = await updateSpeakerStatus(conference.id, id, status);
		if (!result.ok) {
			if (result.reason === 'not_found') {
				return fail(404, { error: 'Speaker is not on this conference roster.' });
			}
			if (result.reason === 'invalid') {
				return fail(400, { error: result.message });
			}
			return fail(400, { error: 'Could not update status.' });
		}

		return { message: 'Speaker status updated.' };
	}
};
