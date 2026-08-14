import { callWindow, type CallWindow } from '$lib/conference/call-window';
import { mySubmission } from '$lib/server/conference/speaker-portal';
import { db } from '$lib/server/db';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to see your proposals');

	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'No such proposal');

	// `mySubmission` returns null both for "no such submission" and for "not
	// yours", and this collapses them into the same 404 on purpose: a 403 would
	// confirm the proposal exists.
	const submission = await mySubmission(locals.user.id, id);
	if (!submission) error(404, 'No such proposal');

	// Same row `openCall` / `publishedFormFor` resolve: announced (`published`
	// or `closed`), oldest first. A draft is the organizer's next call and must
	// not name a date nobody announced — precise and wrong is worse than vague.
	const [call] = await db
		.select({
			status: cfpFormTable.status,
			opensAt: cfpFormTable.opensAt,
			closesAt: cfpFormTable.closesAt
		})
		.from(cfpFormTable)
		.where(
			and(
				eq(cfpFormTable.conferenceId, submission.conferenceId),
				inArray(cfpFormTable.status, ['published', 'closed'])
			)
		)
		.orderBy(asc(cfpFormTable.id))
		.limit(1);

	// The same question the edit loader asks (`openCall` then `state !== 'open'`).
	// A date in the future is not enough: the organizer can close by status
	// while `closes_at` still sits ahead, and `/edit` then sends the speaker
	// straight back here (#514). No announced form, or a conference that is
	// no longer public, is the same answer — not editable.
	const callState: CallWindow =
		submission.conferenceStatus === 'published' && call
			? callWindow(call.opensAt, call.closesAt, call.status === 'closed', new Date())
			: 'closed';

	return {
		submission,
		closesAt: call?.closesAt ?? null,
		callState,
		closedByOrganizer: call?.status === 'closed'
	};
};
