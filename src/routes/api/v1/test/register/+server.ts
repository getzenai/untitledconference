import { auth } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, password } = await request.json();

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Use Better Auth to create the user
		const result = await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: '' // Empty name as required by the schema
			}
		});

		// Better Auth returns user directly on success
		if (result.user) {
			return json({
				success: true,
				user: {
					id: result.user.id,
					email: result.user.email
				}
			});
		} else {
			return json({ error: 'Registration failed' }, { status: 400 });
		}
	} catch (error) {
		console.error('[Test Register API] Error:', error);
		return json({ error: 'Registration failed' }, { status: 500 });
	}
};
