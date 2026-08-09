import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The organizer lands on what needs attention, not on the whole table (journey 2,
 * step 10). The table is one click away and is where they go once they know what
 * they are going there for.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(303, `/manage/${params.slug}/dashboard`);
};
