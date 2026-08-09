import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// If user is logged in, redirect to home page
	if (locals.user) {
		throw redirect(303, '/home');
	} else {
		// Otherwise redirect to login page
		throw redirect(303, '/login');
	}
};
