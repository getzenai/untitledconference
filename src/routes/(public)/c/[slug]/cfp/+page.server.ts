/**
 * The public call for papers (CFP-01).
 *
 * The form is readable with no account, exactly like the five programme surfaces
 * — a speaker deciding whether to propose something should not have to register
 * to find out what is being asked. Submitting is what needs an identity, because
 * a proposal that nobody can come back and edit is not a proposal (CFP-07).
 */
import {
	openCall,
	saveSubmission,
	type SubmissionInput
} from '$lib/server/conference/cfp-submission';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const call = await openCall(params.slug);
	if (!call) error(404, 'This conference is not accepting proposals');

	// The organization id is on the call for the write path; it has no business
	// reaching the browser.
	const { organizationId: _organizationId, ...conference } = call.conference;
	return { call: { ...call, conference } };
};

/** `''` and `'null'` both mean "not chosen" once a select has been through a form post. */
function optionalNumber(value: FormDataEntryValue | null): number | null {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!text || text === 'null') return null;
	const parsed = Number(text);
	return Number.isInteger(parsed) ? parsed : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
	const text = typeof value === 'string' ? value.trim() : '';
	return text || null;
}

function text(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Answers arrive as `answer:<fieldId>`, co-presenters as parallel `co-name` /
 * `co-email` / `co-role` lists. Reading them by name rather than by index keeps
 * the parser from silently pairing the wrong email with the wrong person when a
 * row is removed.
 */
function readInput(data: FormData): SubmissionInput {
	const answers: Record<number, string> = {};
	for (const [key, value] of data.entries()) {
		if (!key.startsWith('answer:') || typeof value !== 'string') continue;
		const fieldId = Number(key.slice('answer:'.length));
		if (Number.isInteger(fieldId)) answers[fieldId] = value.trim();
	}

	const names = data.getAll('co-name').map((v) => text(v));
	const emails = data.getAll('co-email');
	const roles = data.getAll('co-role');
	const coSpeakers = names
		.map((name, i) => ({
			name,
			email: optionalText(emails[i] ?? null),
			roleLabel: optionalText(roles[i] ?? null)
		}))
		.filter((co) => co.name);

	return {
		title: text(data.get('title')),
		abstract: optionalText(data.get('abstract')),
		keyTakeaway: optionalText(data.get('keyTakeaway')),
		audienceLevel: optionalText(data.get('audienceLevel')),
		sessionFormatId: optionalNumber(data.get('sessionFormatId')),
		trackId: optionalNumber(data.get('trackId')),
		answers,
		speaker: {
			name: text(data.get('speakerName')),
			sortName: text(data.get('speakerSortName')),
			email: text(data.get('speakerEmail')),
			jobTitle: optionalText(data.get('speakerJobTitle')),
			company: optionalText(data.get('speakerCompany')),
			bio: optionalText(data.get('speakerBio'))
		},
		coSpeakers
	};
}

async function save(
	userId: string | undefined,
	slug: string,
	data: FormData,
	submit: boolean,
	pathname: string
) {
	// Signing in is a redirect, not an error: the visitor did nothing wrong, and
	// `returnTo` brings them back to this call rather than to a generic home page.
	if (!userId) redirect(303, `/login?returnTo=${encodeURIComponent(pathname)}`);

	const result = await saveSubmission(userId, slug, readInput(data), { submit });

	if (!result.ok) {
		// `invalid` is checked first because it is the only case carrying detail —
		// testing it first is what lets the compiler see that detail exists here.
		if (result.reason === 'invalid') {
			return fail(400, { errors: result.errors, fieldErrors: result.fieldErrors });
		}
		if (result.reason === 'closed') return fail(409, { closed: true });
		if (result.reason === 'forbidden') error(403, 'That proposal is not yours');
		error(404, 'This conference is not accepting proposals');
	}

	redirect(303, `/portal/submissions/${result.submissionId}`);
}

export const actions: Actions = {
	// Saving and submitting are separate actions rather than one action with a
	// mode flag, because they have different rules: a draft needs a title and
	// nothing else, a submission needs every visible required field.
	draft: async ({ request, params, locals, url }) =>
		save(locals.user?.id, params.slug, await request.formData(), false, url.pathname),

	submit: async ({ request, params, locals, url }) =>
		save(locals.user?.id, params.slug, await request.formData(), true, url.pathname)
};
