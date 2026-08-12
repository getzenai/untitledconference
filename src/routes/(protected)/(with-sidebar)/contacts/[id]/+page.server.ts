/**
 * Contact detail — identity, persistent notes, tags, cross-event history (CRM-03/04),
 * push-to-event handoff (CRM-10), and near-duplicate merge (CRM-06).
 */
import { findNameDuplicates, mergeContacts } from '$lib/server/conference/contact-merge';
import {
	getContact,
	pushableConferences,
	pushContactToConference,
	updateContact
} from '$lib/server/conference/contacts';
import { isSpeakerStatus, type SpeakerStatus } from '$lib/server/conference/speakers';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

function optionalText(form: FormData, key: string): string | null {
	const value = String(form.get(key) ?? '').trim();
	return value === '' ? null : value;
}

function profileId(params: { id: string }): number {
	const id = Number(params.id);
	return Number.isInteger(id) && id > 0 ? id : 0;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const id = profileId(params);
	const userId = locals.user!.id;
	const contact = await getContact(userId, id);
	if (!contact) throw error(404, 'Contact not found');

	const [conferences, duplicates] = await Promise.all([
		pushableConferences(userId),
		findNameDuplicates(userId, id)
	]);
	const alreadyOn = new Set(contact.events.map((e) => e.conferenceId));
	const availableEvents = conferences.filter(
		(c) => c.organizationId === contact.organizationId && !alreadyOn.has(c.id)
	);

	return { contact, availableEvents, duplicates };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const id = profileId(params);
		const form = await request.formData();

		const result = await updateContact(locals.user!.id, id, {
			name: text(form, 'name'),
			email: optionalText(form, 'email'),
			jobTitle: optionalText(form, 'jobTitle'),
			company: optionalText(form, 'company'),
			bio: optionalText(form, 'bio'),
			sortName: optionalText(form, 'sortName'),
			notes: optionalText(form, 'notes'),
			tags: optionalText(form, 'tags')
		});

		if (!result.ok) {
			if (result.reason === 'not_found') return fail(404, { error: 'Contact not found.' });
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			return fail(400, { error: 'Could not save the contact.' });
		}

		return { message: 'Contact saved.' };
	},

	push: async ({ locals, params, request }) => {
		const id = profileId(params);
		const form = await request.formData();
		const slug = text(form, 'conferenceSlug').trim();
		const statusRaw = text(form, 'status').trim();
		const status: SpeakerStatus = isSpeakerStatus(statusRaw) ? statusRaw : 'invited';

		if (!slug) return fail(400, { error: 'Pick an event to add this contact to.' });

		const result = await pushContactToConference(locals.user!.id, id, slug, status);
		if (!result.ok) {
			if (result.reason === 'already_on_roster') {
				return fail(400, { error: 'Already on that event’s speaker roster.' });
			}
			if (result.reason === 'not_found') {
				return fail(404, { error: 'Contact or event not found.' });
			}
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			return fail(400, { error: 'Could not add to the event.' });
		}

		return { message: 'Added to the event speaker roster.' };
	},

	merge: async ({ locals, params, request }) => {
		const primaryId = profileId(params);
		const form = await request.formData();
		const secondaryId = Number(form.get('secondaryId'));

		const result = await mergeContacts(locals.user!.id, primaryId, secondaryId);
		if (!result.ok) {
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			return fail(404, { error: 'Could not merge — one of the contacts was not found.' });
		}

		// Land on the surviving primary with a confirmation.
		throw redirect(303, `/contacts/${result.primaryId}?merged=1`);
	}
};
