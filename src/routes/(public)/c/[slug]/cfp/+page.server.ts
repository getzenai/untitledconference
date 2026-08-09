/**
 * The public call for papers (CFP-01).
 *
 * The form is readable with no account, exactly like the five programme surfaces
 * — a speaker deciding whether to propose something should not have to register
 * to find out what is being asked. Submitting is what needs an identity, because
 * a proposal that nobody can come back and edit is not a proposal (CFP-07); the
 * coming-back half lives at `/portal/submissions/<id>/edit`.
 */
import { openCall, saveSubmission } from '$lib/server/conference/cfp-submission';
import { readProposal } from '$lib/server/conference/proposal-input';
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

	const result = await saveSubmission(userId, slug, readProposal(data), { submit });

	if (!result.ok) {
		// `invalid` is checked first because it is the only case carrying detail —
		// testing it first is what lets the compiler see that detail exists here.
		if (result.reason === 'invalid') {
			return fail(400, { errors: result.errors, fieldErrors: result.fieldErrors });
		}
		if (result.reason === 'closed') return fail(409, { closed: true });
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
