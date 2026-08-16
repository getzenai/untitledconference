import { callWindow, type CallWindow } from '$lib/conference/call-window';
import { parseSpeakerSupport } from '$lib/conference/speaker-support';
import { deleteOwnDraft, withdrawSubmission } from '$lib/server/conference/cfp-submission';
import { mySubmission } from '$lib/server/conference/speaker-portal';
import { db } from '$lib/server/db';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const WITHDRAWABLE = new Set(['submitted', 'in_review']);

async function announcedCall(conferenceId: number) {
	// Same row `openCall` / `publishedFormFor` resolve: announced (`published`
	// or `closed`), oldest first. A draft is the organizer's next call and must
	// not name a date nobody announced — precise and wrong is worse than vague.
	const [call] = await db
		.select({
			status: cfpFormTable.status,
			opensAt: cfpFormTable.opensAt,
			closesAt: cfpFormTable.closesAt,
			speakerSupport: cfpFormTable.speakerSupport
		})
		.from(cfpFormTable)
		.where(
			and(
				eq(cfpFormTable.conferenceId, conferenceId),
				inArray(cfpFormTable.status, ['published', 'closed'])
			)
		)
		.orderBy(asc(cfpFormTable.id))
		.limit(1);
	return call ?? null;
}

function callStateFor(
	conferenceStatus: string,
	call: { opensAt: Date | null; closesAt: Date | null; status: string } | null
): CallWindow {
	// The same question the edit loader asks (`openCall` then `state !== 'open'`).
	// A date in the future is not enough: the organizer can close by status
	// while `closes_at` still sits ahead, and `/edit` then sends the speaker
	// straight back here (#514). No announced form, or a conference that is
	// no longer public, is the same answer — not editable.
	return conferenceStatus === 'published' && call
		? callWindow(call.opensAt, call.closesAt, call.status === 'closed', new Date())
		: 'closed';
}

function submissionId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id)) error(404, 'No such proposal');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to see your proposals');

	const id = submissionId(params.id);

	// `mySubmission` returns null both for "no such submission" and for "not
	// yours", and this collapses them into the same 404 on purpose: a 403 would
	// confirm the proposal exists.
	const submission = await mySubmission(locals.user.id, id);
	if (!submission) error(404, 'No such proposal');

	const call = await announcedCall(submission.conferenceId);
	const callState = callStateFor(submission.conferenceStatus, call);

	return {
		submission,
		closesAt: call?.closesAt ?? null,
		callState,
		closedByOrganizer: call?.status === 'closed',
		support: parseSpeakerSupport(call?.speakerSupport),
		canWithdraw:
			callState === 'open' && submission.isPrimary && WITHDRAWABLE.has(submission.status),
		// A draft was never offered, so deleting it does not wait on the call window.
		canDelete: submission.isPrimary && submission.status === 'draft'
	};
};

export const actions: Actions = {
	/**
	 * The speaker takes the talk back. Same write as MCP `withdraw_proposal`.
	 *
	 * The call-window check is the page's, not the write's: a closed call still
	 * lets an MCP client withdraw, and the UI must not invent a second status
	 * machine. Refusing here keeps the button honest — it is only drawn while
	 * `canWithdraw` is true.
	 */
	withdraw: async ({ params, locals }) => {
		if (!locals.user) error(401, 'Sign in to withdraw a proposal');

		const id = submissionId(params.id);
		const submission = await mySubmission(locals.user.id, id);
		if (!submission) error(404, 'No such proposal');

		const call = await announcedCall(submission.conferenceId);
		if (callStateFor(submission.conferenceStatus, call) !== 'open') {
			return fail(409, { withdrawError: 'This call has closed.' });
		}

		const result = await withdrawSubmission(locals.user.id, id);
		if (!result.ok) {
			if (result.reason === 'not_found') error(404, 'No such proposal');
			return fail(409, {
				withdrawError: 'That proposal already has a decision and cannot be withdrawn.'
			});
		}

		return { withdrawn: true };
	},

	/**
	 * The speaker throws the unfinished draft away. Same write as
	 * `deleteOwnDraft`. Unlike withdraw, this does not wait on the call
	 * window — an abandoned draft after the close is the usual case.
	 */
	deleteDraft: async ({ params, locals }) => {
		if (!locals.user) error(401, 'Sign in to delete a draft');

		const id = submissionId(params.id);
		const submission = await mySubmission(locals.user.id, id);
		if (!submission) error(404, 'No such proposal');

		const result = await deleteOwnDraft(locals.user.id, id);
		if (!result.ok) {
			if (result.reason === 'not_found') error(404, 'No such proposal');
			return fail(409, { deleteError: 'Only an unsubmitted draft can be deleted.' });
		}

		redirect(303, '/portal');
	}
};
