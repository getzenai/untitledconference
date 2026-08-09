import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The organizer's workplace is the submissions table (journey 2, step 4). */
export const load: PageServerLoad = async ({ params }) => {
	redirect(303, `/manage/${params.slug}/submissions`);
};
