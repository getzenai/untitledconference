import { auth } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Get the authorization header or session token
		const authHeader = request.headers.get('authorization');
		const token = authHeader?.replace('Bearer ', '');

		if (!token) {
			return json({ error: 'No token provided' }, { status: 400 });
		}

		// Use Better Auth to sign out the user
		await auth.api.signOut({
			headers: {
				authorization: `Bearer ${token}`
			}
		});

		return json({ success: true });
	} catch (error) {
		console.error('[Test Logout API] Error:', error);
		return json({ error: 'Logout failed' }, { status: 500 });
	}
};
