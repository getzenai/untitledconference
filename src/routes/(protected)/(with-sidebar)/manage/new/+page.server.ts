/**
 * Starting a conference (SET-01).
 *
 * A static segment beside `[slug]`, so `/manage/new` is the form and
 * `/manage/anything-else` is still a conference.
 */
import { MAX_CONFERENCE_DAYS } from '$lib/conference/conference-dates';
import { slugify } from '$lib/conference/slug';
import {
	createConference,
	organizationForNewConference
} from '$lib/server/conference/create-conference';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Belonging to no organization is not an error here, it is the previous step:
	// the page says so and links to it rather than refusing to render.
	const organizationId = await organizationForNewConference(locals.user!.id);
	return { canCreate: organizationId !== null };
};

const MESSAGES = {
	name: 'Give the conference a name.',
	slug: 'Use lowercase letters, numbers and hyphens — this becomes the public address.',
	startsOn: 'That start date is not a real date. Use YYYY-MM-DD.',
	endsOn: `Check the end date — it must be a real date, on or after the start, and within ${MAX_CONFERENCE_DAYS} days of it.`,
	slug_taken: 'That address is already taken. Try another.',
	slug_reserved: '“new” is reserved — /manage/new is the page you are on. Pick another address.',
	no_organization: 'Create an organization first — a conference belongs to one.'
} as const;

/** A trimmed field, or null when the organizer left it blank. */
function optional(form: FormData, key: string): string | null {
	return String(form.get(key) ?? '').trim() || null;
}

/**
 * `invalid` is the only reason whose message depends on which field was wrong.
 * `slug_taken` names a field too, but the field is not the complaint — "use
 * lowercase letters" would be a lie about an address that is spelled perfectly
 * and merely belongs to somebody else.
 */
function messageFor(reason: string, field: string | undefined): string {
	const key = reason === 'invalid' ? (field ?? 'name') : reason;
	return MESSAGES[key as keyof typeof MESSAGES] ?? 'That did not work.';
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		// An empty address field means "use the name" rather than an error: it
		// refines a decision the organizer already made by typing a name, and
		// asking twice for the same answer is how forms get abandoned.
		const values = {
			name,
			slug: optional(form, 'slug') ?? slugify(name),
			startsOn: optional(form, 'startsOn'),
			endsOn: optional(form, 'endsOn')
		};

		const result = await createConference(locals.user!.id, values);

		if (!result.ok) {
			return fail(result.reason === 'no_organization' ? 403 : 400, {
				values,
				error: messageFor(result.reason, result.field),
				field: result.field ?? null
			});
		}

		redirect(303, `/manage/${result.conference.slug}/submissions`);
	}
};
