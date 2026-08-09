import { requireOrganizer } from '$lib/server/conference/access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	// The one permission boundary in the product, asked once for the whole area.
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return { conference };
};
