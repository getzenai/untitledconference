import { auth } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, password } = await request.json();

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Use Better Auth to sign in the user
		const result = await auth.api.signInEmail({
			body: {
				email,
				password
			}
		});

		// Better Auth returns user and token on success
		if (result.user) {
			return json({
				success: true,
				user: {
					id: result.user.id,
					email: result.user.email
				},
				token: result.token
			});
		} else {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}
	} catch (error) {
		console.error('[Test Login API] Error:', error);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
