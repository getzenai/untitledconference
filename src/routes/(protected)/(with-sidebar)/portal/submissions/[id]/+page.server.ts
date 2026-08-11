import { mySubmission } from '$lib/server/conference/speaker-portal';
import { error } from '@sveltejs/kit';
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

	return { submission };
};
