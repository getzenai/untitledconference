/**
 * Finishing a draft — the second half of CFP-07.
 *
 * Saving a proposal you cannot come back to is not much of a feature; this is
 * where coming back happens. Its own URL rather than a mode on the public call,
 * because the thing being edited is a specific resource and the address should
 * say which.
 */
import { openCall, saveSubmission } from '$lib/server/conference/cfp-submission';
import { readProposal } from '$lib/server/conference/proposal-input';
import { editableDraft, ownSubmissionStatus } from '$lib/server/conference/speaker-portal';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function submissionId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id)) error(404, 'No such proposal');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to edit your proposal');

	const id = submissionId(params.id);

	// One 404 for the two refusals that are none of the asker's business — no such
	// submission, not yours. Distinguishing those would tell a stranger which one
	// applied; the wording matches the heading the error page prints, because a
	// 404 that says "this proposal cannot be edited" argues with itself (#496).
	const editable = await editableDraft(locals.user.id, id);
	if (!editable) {
		// The third refusal is the speaker's own decided talk, and it is exactly the
		// moment they care most about the text. Send them to the proposal, which
		// says editing closed and why, instead of throwing them out of the portal.
		if (await ownSubmissionStatus(locals.user.id, id)) redirect(303, `/portal/submissions/${id}`);
		error(404, 'No such proposal');
	}

	const call = await openCall(editable.conferenceSlug);
	if (!call) error(404, 'This conference is not accepting proposals');
	// A closed call is read-only (CFP-16). The proposal is still visible on its
	// own page; it just cannot be rewritten.
	if (call.state !== 'open') redirect(303, `/portal/submissions/${id}`);

	const { organizationId: _organizationId, ...conference } = call.conference;
	return {
		call: { ...call, conference },
		draft: editable.draft,
		submissionId: id,
		status: editable.status,
		ownerId: locals.user.id
	};
};

async function save(userId: string | undefined, idRaw: string, data: FormData, submit: boolean) {
	if (!userId) error(401, 'Sign in to edit your proposal');

	const id = submissionId(idRaw);
	const editable = await editableDraft(userId, id);
	if (!editable) {
		// A decision that landed while this form was open: the same answer the
		// loader gives, so the tab they are looking at becomes the proposal page
		// that explains it rather than an error.
		if (await ownSubmissionStatus(userId, id)) redirect(303, `/portal/submissions/${id}`);
		error(404, 'No such proposal');
	}

	const result = await saveSubmission(userId, editable.conferenceSlug, readProposal(data), {
		submit,
		submissionId: id
	});

	if (!result.ok) {
		if (result.reason === 'invalid') {
			return fail(400, { errors: result.errors, fieldErrors: result.fieldErrors });
		}
		if (result.reason === 'closed') return fail(409, { closed: true });
		// `forbidden` and `not_found` both mean "not yours to rewrite by the time we
		// wrote" — the same answer the loader gives.
		error(404, 'No such proposal');
	}

	// `justSubmitted` is a transient signal for the goose-feather confetti, not
	// part of the page's truth — the confirmation banner below still reads off
	// the submission's status, not this param, and the page strips it on mount.
	redirect(303, `/portal/submissions/${id}${submit ? '?justSubmitted=1' : ''}`);
}

export const actions: Actions = {
	draft: async ({ request, params, locals }) =>
		save(locals.user?.id, params.id, await request.formData(), false),

	submit: async ({ request, params, locals }) =>
		save(locals.user?.id, params.id, await request.formData(), true)
};
