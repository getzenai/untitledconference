/**
 * The files library (CNT-13).
 *
 * A read-only page: everything that changes a file — approving it, commenting on
 * it — already has a home on the task it belongs to, and a second place to do it
 * is a second place for the two to disagree. What is only here is the view across
 * tasks, and the selection that leaves as one archive (CNT-14).
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { listConferenceFiles } from '$lib/server/conference/organizer-content';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return { files: await listConferenceFiles(conference.id) };
};
