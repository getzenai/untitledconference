/**
 * Organizer speaker roster (SPK-01 / SPK-02 / SPK-04).
 *
 * Filters live in the URL so a search is shareable and survives a reload.
 * Writes go through the speakers module, which owns org-scoping.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { dispatchConferenceEmails } from '$lib/server/conference/email-dispatcher';
import { queueSpeakerMail } from '$lib/server/conference/speaker-mail';
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

type ParsedMail =
	| { ok: true; filters: SpeakerRosterFilters; subject: string; body: string }
	| { ok: false; error: string };

function parseMail(form: FormData): ParsedMail {
	const q = text(form, 'q').trim() || undefined;
	const rawStatus = text(form, 'status').trim();
	const status = isSpeakerStatus(rawStatus) ? rawStatus : undefined;
	const subject = text(form, 'subject').trim();
	const body = text(form, 'body').trim();
	if (!subject) return { ok: false, error: 'A subject is required.' };
	if (!body) return { ok: false, error: 'A message is required.' };
	if (subject.length > 200) return { ok: false, error: 'Subject must be 200 characters or fewer.' };
	if (body.length > 10_000)
		return { ok: false, error: 'Message must be 10,000 characters or fewer.' };
	return { ok: true, filters: { q, status }, subject, body };
}

function deliveryMessage(
	queued: { queued: number; withoutEmail: number },
	dispatch: Awaited<ReturnType<typeof dispatchConferenceEmails>>
) {
	const skipped = queued.withoutEmail > 0 ? ` ${queued.withoutEmail} without email skipped.` : '';
	if (dispatch.disabled) {
		return `${queued.queued} email${queued.queued === 1 ? '' : 's'} queued.${skipped}`;
	}
	const failed = dispatch.failed > 0 ? `, ${dispatch.failed} failed` : '';
	const remaining = dispatch.remaining > 0 ? `, ${dispatch.remaining} still queued` : '';
	return `${dispatch.sent} email${dispatch.sent === 1 ? '' : 's'} sent${failed}${remaining}.${skipped}`;
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
	},

	compose: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const mail = parseMail(await request.formData());
		if (!mail.ok) return fail(400, { error: mail.error });
		const queued = await queueSpeakerMail(conference.id, mail.filters, mail.subject, mail.body);
		if (queued.queued === 0) {
			return fail(400, { error: 'No speakers in this filter have an email address.' });
		}
		const dispatch = await dispatchConferenceEmails(conference.id);
		return { message: deliveryMessage(queued, dispatch) };
	}
};
