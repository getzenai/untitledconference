import { requireReviewer } from '$lib/server/conference/reviewer';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	// CFP-10: the reviewer's boundary, asked once for the whole area — and the answer
	// is a 404 for "not yours" as well as "no such conference".
	const { conference } = await requireReviewer(locals.user!.id, params.slug);

	return {
		conference: {
			name: conference.name,
			slug: conference.slug,
			reviewVisibility: conference.reviewVisibility
		}
	};
};
