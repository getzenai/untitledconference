import type { QueueSort } from '$lib/conference/review-visibility';
import { requireReviewer, reviewQueue } from '$lib/server/conference/reviewer';
import { isFeatureEnabled } from '$lib/server/feature-flags';
import type { PageServerLoad } from './$types';

const SORTS: QueueSort[] = ['coverage', 'score', 'title', 'track'];

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireReviewer(locals.user!.id, params.slug);

	// The sort lives in the URL: a reviewer sending a colleague "the ones nobody has
	// looked at" should be able to send the link they are looking at.
	const raw = url.searchParams.get('sort') as QueueSort;
	const sort = SORTS.includes(raw) ? raw : 'coverage';

	return {
		queue: await reviewQueue(conference, locals.user!.id, sort),
		sort,
		chatEnabled: isFeatureEnabled('inAppChat')
	};
};
