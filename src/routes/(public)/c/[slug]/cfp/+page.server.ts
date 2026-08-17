/**
 * The public call for papers (CFP-01).
 *
 * The form is readable with no account, exactly like the five programme surfaces
 * — a speaker deciding whether to propose something should not have to register
 * to find out what is being asked. Submitting is what needs an identity, because
 * a proposal that nobody can come back and edit is not a proposal (CFP-07); the
 * coming-back half lives at `/portal/submissions/<id>/edit`.
 */
import { cfpHasOpenProposal } from '$lib/conference/pending-proposal';
import type { ProposalDraft } from '$lib/conference/proposal-draft';
import { openCall, saveSubmission } from '$lib/server/conference/cfp-submission';
import { readProposal } from '$lib/server/conference/proposal-input';
import {
	clearRegistrationProposal,
	registrationProposalForUser
} from '$lib/server/conference/registration-proposal';
import { submissionForConference } from '$lib/server/conference/speaker-portal';
import { myProfiles } from '$lib/server/conference/speaker-profile';
import { createLogger } from '$lib/server/logger';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const logger = createLogger('PublicCfp');

export type CfpSpeakerProfile = {
	organizationName: string;
	speaker: ProposalDraft['speaker'];
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const call = await openCall(params.slug);
	if (!call) error(404, 'This conference is not accepting proposals');

	// Profile first: `myProfiles` claims unclaimed rows that already carry this
	// address, and `submissionForConference` only sees a row once `userId` is set.
	const speakerProfile = locals.user
		? await profileForThisCall(locals.user.id, call.conference.organizationId)
		: null;

	// Someone who already proposed here would otherwise be shown a blank form with
	// no sign of it, and a second save would make a second proposal — which is
	// exactly how the duplicate pairs got into the organizer's list. One extra
	// query, only for signed-in visitors.
	const existing = locals.user
		? await submissionForConference(locals.user.id, call.conference.id)
		: null;
	const pendingProposal =
		locals.user && !cfpHasOpenProposal(existing)
			? await registrationProposalForUser(locals.user.id, call.conference.slug)
			: null;

	// The organization id is on the call for the write path; it has no business
	// reaching the browser.
	const { organizationId: _organizationId, ...conference } = call.conference;
	return { call: { ...call, conference }, existing, speakerProfile, pendingProposal };
};

/**
 * The profile this account already has at this organizer, or nothing.
 *
 * Scoped to the conference's organization on purpose. A bio written for org A
 * must not land in org B's form — saving would then write it there. A first
 * proposal at a new organizer starts blank; that is the honest empty state.
 */
async function profileForThisCall(
	userId: string,
	organizationId: string
): Promise<CfpSpeakerProfile | null> {
	const mine = (await myProfiles(userId)).find((row) => row.organizationId === organizationId);
	if (!mine) return null;

	return {
		organizationName: mine.organizationName,
		speaker: {
			name: mine.name,
			sortName: mine.sortName,
			email: mine.email ?? '',
			jobTitle: mine.jobTitle ?? '',
			company: mine.company ?? '',
			bio: mine.bio ?? ''
		}
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

	// The submission is already durable. A best-effort cleanup must not turn that
	// successful write into an error page (or invite a duplicate on retry).
	try {
		await clearRegistrationProposal(userId, slug);
	} catch (cleanupError) {
		logger.error('Could not clear registration proposal handoff', cleanupError as Error, {
			userId,
			slug
		});
	}

	// `justSubmitted` is a transient signal for the goose-feather confetti, not
	// part of the page's truth — the confirmation banner below still reads off
	// the submission's status, not this param, and the page strips it on mount.
	redirect(303, `/portal/submissions/${result.submissionId}${submit ? '?justSubmitted=1' : ''}`);
}

export const actions: Actions = {
	// Saving and submitting are separate actions rather than one action with a
	// mode flag, because they have different rules: a draft needs a title and
	// nothing else, a submission needs every visible required field.
	draft: async ({ request, params, locals, url }) =>
		save(locals.user?.id, params.slug, await request.formData(), false, url.pathname),

	submit: async ({ request, params, locals, url }) =>
		save(locals.user?.id, params.slug, await request.formData(), true, url.pathname),

	/**
	 * E2E only (#482). A real uncaught throw from this action, not an intercepted
	 * status and not `fail()`. The public call is the worst instance in the app:
	 * a stranger's abstract has no draft and no way back, so the client must keep
	 * the page and the typed values.
	 *
	 * Gated by the same flag as `/api/v1/test/*`. Without it this is a 404, so a
	 * production POST cannot use the route as a crash button. A session is
	 * required too — the real submit already is, and this must not be easier.
	 */
	e2eForce500: async ({ locals }) => {
		if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
			error(404, 'Not found');
		}
		if (!locals.user) error(404, 'Not found');
		throw new Error('e2e forced action 500');
	}
};
