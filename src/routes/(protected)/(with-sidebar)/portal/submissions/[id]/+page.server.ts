import { mySubmission } from '$lib/server/conference/speaker-portal';
import { db } from '$lib/server/db';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
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

	// The close instant lives on the call, not the proposal. Speakers used to
	// be told only "before the call closes" — the date sat exclusively on the
	// editor (#498). Read it here so a draft names the moment without a second
	// trip through `/edit`.
	const [call] = await db
		.select({ closesAt: cfpFormTable.closesAt })
		.from(cfpFormTable)
		.where(eq(cfpFormTable.conferenceId, submission.conferenceId))
		.limit(1);

	return { submission, closesAt: call?.closesAt ?? null };
};
