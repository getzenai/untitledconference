import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	// The auth logic is handled by hooks.server.ts
	// If we reach here, the user is authenticated for this protected route.
	return json({ message: 'You have accessed a protected route!', user: locals.user });
};
